/* ============================================================
   全表挑戰 —— 每週日限定
   把目前解鎖的整張表跑一遍，計總時間。每週一次，看曲線一路往下。
   ============================================================ */

import { pool } from '../engine.js';
import { askNumber, subCtx, Abort, el } from '../ui.js';
import { sfx } from '../sound.js';

export const meta = { id: 'weekly', name: '全表挑戰', desc: '整張表跑一遍，計時', icon: '🏁' };

const fmt = ms => {
  const s = Math.round(ms / 1000);
  return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
};

export async function run(ctx) {
  ctx.setTitle(meta.name);
  ctx.setScore(0);
  ctx.showTimer(false);
  sfx.start();

  const { sub, release } = subCtx(ctx);
  const startedAt = Date.now();
  const qs = pool(ctx.store.s).sort(() => Math.random() - 0.5);
  let correct = 0, total = 0, msSum = 0, msN = 0, combo = 0, best = 0;

  try {
    for (const [a, b] of qs) {
      const elapsed = Date.now() - startedAt;
      const note = el('div', 'hint',
        `第 <b>${total + 1}</b> / ${qs.length} 題　·　已用 ${fmt(elapsed)}` +
        (ctx.store.s.pb.weekly ? `　·　最佳 ${fmt(ctx.store.s.pb.weekly)}` : ''));

      const r = await askNumber(sub, {
        tokens: [{ t: a }, { t: '×', op: 1 }, { t: b }, { t: '=', op: 1 }, { slot: 1 }],
        answer: a * b, maxLen: 2, hintNode: note
      });

      total++;
      ctx.store.recordFact(a, b, r.ok, r.ms);
      ctx.log({ mode: meta.id, qtype: 'ab', a, b, prompt: `${a}x${b}`,
                given: r.given, answer: a * b, ok: r.ok, ms: r.ms });

      if (r.ok) {
        correct++; combo++; best = Math.max(best, combo);
        msSum += r.ms; msN++;
        ctx.setScore(correct);
        if (combo >= 5) { ctx.hitCombo(combo); sfx.combo(combo); }
      } else combo = 0;
    }
  } catch (e) {
    if (e.name !== 'Abort') throw e;
  } finally { release(); ctx.showTimer(true); }

  if (ctx.signal.aborted) throw new Abort();

  const dur = Date.now() - startedAt;
  // 只有全部答完才算成績（中途沒跑完不記錄）
  const finished = total === qs.length;
  const isPB = finished && ctx.store.pb('weekly', dur, 'low');

  return {
    mode: meta.id, name: meta.name,
    total, correct, score: correct, bestCombo: best,
    startedAt, endedAt: Date.now(), msSum, msN,
    hero: fmt(dur), heroCap: '總 花 費 時 間',
    stats: [
      ['答對', `${correct}/${total}`],
      ['平均秒數', msN ? (msSum / msN / 1000).toFixed(1) : '—'],
      ['最佳', ctx.store.s.pb.weekly ? fmt(ctx.store.s.pb.weekly) : '—']
    ],
    pbHit: isPB, pbLabel: '全表新紀錄',
    stars: correct * 2 + (isPB ? 30 : 0)
  };
}
