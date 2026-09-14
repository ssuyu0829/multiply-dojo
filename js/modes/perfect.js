/* ============================================================
   零失誤挑戰 —— A 生的主關（治粗心）
   答錯就結束，只記最長連對。
   關鍵設計：送出鍵在輸入後鎖 300ms，強迫「再看一眼」。
   ============================================================ */

import { pick, timeLimit } from '../engine.js';
import { askNumber, subCtx, Abort, el } from '../ui.js';
import { sfx } from '../sound.js';

export const meta = { id: 'perfect', name: '零失誤挑戰', desc: '答錯就結束，能連對幾題？', icon: '🎯' };

/* 連對越多，背景越燙 */
const HEAT = ['#0b1220', '#141a2c', '#1c1c33', '#28202f', '#33212a', '#3d2024', '#4a1f1e'];

export async function run(ctx) {
  ctx.setTitle(meta.name);
  ctx.setScore(0);
  sfx.start();

  const { sub, release } = subCtx(ctx);
  const startedAt = Date.now();
  let streak = 0, total = 0, correct = 0, msSum = 0, msN = 0;
  const recent = [];
  const prevBg = document.body.style.background;

  try {
    for (;;) {
      const [a, b] = pick(ctx.store, { avoid: recent });
      recent.push(ctx.store.key(a, b));
      if (recent.length > 4) recent.shift();

      document.body.style.background = HEAT[Math.min(streak >> 1, HEAT.length - 1)];

      const note = el('div', 'hint',
        streak ? `目前連對 <b>${streak}</b> 題　·　個人最佳 ${ctx.store.s.pb.perfect}`
               : `別急，答錯就結束了　·　個人最佳 ${ctx.store.s.pb.perfect}`);

      const r = await askNumber(sub, {
        tokens: [{ t: a }, { t: '×', op: 1 }, { t: b }, { t: '=', op: 1 }, { slot: 1 }],
        answer: a * b, maxLen: 2,
        limitMs: timeLimit(ctx.store, a, b),
        lockMs: 300,                       // ← 防手滑，強迫再看一眼
        hintNode: note
      });

      total++;
      ctx.store.recordFact(a, b, r.ok, r.ms);
      ctx.log({ mode: meta.id, qtype: 'ab', a, b, prompt: `${a}x${b}`,
                given: r.given, answer: a * b, ok: r.ok, ms: r.ms });

      if (!r.ok) { sfx.fail(); break; }

      correct++; streak++; msSum += r.ms; msN++;
      ctx.setScore(streak);
      if (streak >= 3) { ctx.hitCombo(streak); sfx.combo(streak); }
      if (streak === ctx.store.s.pb.perfect + 1 && ctx.store.s.pb.perfect > 0) {
        sfx.record();
        ctx.flashBanner('破紀錄！');
      }
    }
  } catch (e) {
    if (e.name !== 'Abort') throw e;
  } finally {
    document.body.style.background = prevBg;
    release();
  }

  if (ctx.signal.aborted) throw new Abort();

  const isPB = ctx.store.pb('perfect', streak);
  return {
    mode: meta.id, name: meta.name,
    total, correct, score: streak, bestCombo: streak,
    startedAt, endedAt: Date.now(), msSum, msN,
    hero: streak, heroCap: '連 對 題 數',
    stats: [
      ['個人最佳', ctx.store.s.pb.perfect],
      ['平均秒數', msN ? (msSum / msN / 1000).toFixed(1) : '—'],
      ['總題數', total]
    ],
    pbHit: isPB, pbLabel: '連對新紀錄',
    stars: streak * 2
  };
}
