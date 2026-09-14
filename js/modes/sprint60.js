/* ============================================================
   閃電 60 秒 —— 兩人共用的暖身關
   60 秒衝刺，連對觸發 combo 倍率。題目由自適應引擎抽。
   ============================================================ */

import { pick } from '../engine.js';
import { askNumber, subCtx, Abort } from '../ui.js';
import { sfx } from '../sound.js';

export const meta = { id: 'sprint60', name: '閃電 60 秒', desc: '60 秒內答對越多越好', icon: '⚡' };

export async function run(ctx) {
  const DUR = 60000;
  ctx.setTitle(meta.name);
  ctx.setScore(0);
  sfx.start();

  const { sub, ac, release } = subCtx(ctx);
  const startedAt = Date.now();
  let correct = 0, total = 0, combo = 0, best = 0, score = 0, msSum = 0, msN = 0;
  const recent = [];

  const tick = setInterval(() => {
    const left = 1 - (Date.now() - startedAt) / DUR;
    ctx.setTimer(Math.max(0, left));
    ctx.warnTimer(left < 0.18);
    if (left <= 0) { clearInterval(tick); ac.abort(); }
  }, 100);

  try {
    for (;;) {
      const [a, b] = pick(ctx.store, { avoid: recent });
      recent.push(ctx.store.key(a, b));
      if (recent.length > 4) recent.shift();

      const r = await askNumber(sub, {
        tokens: [{ t: a }, { t: '×', op: 1 }, { t: b }, { t: '=', op: 1 }, { slot: 1 }],
        answer: a * b, maxLen: 2
      });

      total++;
      ctx.store.recordFact(a, b, r.ok, r.ms);
      ctx.log({ mode: meta.id, qtype: 'ab', a, b, prompt: `${a}x${b}`,
                given: r.given, answer: a * b, ok: r.ok, ms: r.ms });

      if (r.ok) {
        correct++; combo++; best = Math.max(best, combo);
        msSum += r.ms; msN++;
        const mult = combo >= 10 ? 2 : combo >= 6 ? 1.5 : combo >= 3 ? 1.2 : 1;
        score += Math.round(10 * mult);
        if (combo >= 3) { ctx.hitCombo(combo); sfx.combo(combo); }
        ctx.setScore(score);
      } else {
        combo = 0;
      }
    }
  } catch (e) {
    if (e.name !== 'Abort') throw e;
  } finally {
    clearInterval(tick);
    ctx.warnTimer(false);
    release();
  }

  if (ctx.signal.aborted) throw new Abort();      // 使用者按了 ✕

  const isPB = ctx.store.pb('sprint60', correct);
  return {
    mode: meta.id, name: meta.name,
    total, correct, score, bestCombo: best,
    startedAt, endedAt: Date.now(), msSum, msN,
    hero: correct, heroCap: '答 對 題 數',
    stats: [
      ['正確率', total ? Math.round(correct / total * 100) + '%' : '—'],
      ['最長連對', best],
      ['平均秒數', msN ? (msSum / msN / 1000).toFixed(1) : '—']
    ],
    pbHit: isPB, pbLabel: '閃電新紀錄',
    stars: Math.round(score / 10)
  };
}
