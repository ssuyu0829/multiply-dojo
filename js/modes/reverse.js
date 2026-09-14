/* ============================================================
   逆推 —— S 生的主關（動腦，不是重複計算）
   單解型：? × 7 = 56
   多解型：□ × □ = 36  → 找出 1~9 內所有組合
   多解型在訓練因數概念，是小五的先修。
   ============================================================ */

import { pick } from '../engine.js';
import { askNumber, el, abortable, subCtx, Abort, sleep } from '../ui.js';
import { sfx } from '../sound.js';

export const meta = { id: 'reverse', name: '逆推挑戰', desc: '倒過來想：什麼乘什麼？', icon: '🔄' };

const N_Q = 10;

/* 1~9 內有兩組以上因數分解的積 */
const MULTI = (() => {
  const m = new Map();
  for (let i = 1; i <= 9; i++)
    for (let j = i; j <= 9; j++) {
      const p = i * j;
      (m.get(p) || m.set(p, []).get(p)).push([i, j]);
    }
  return [...m.entries()].filter(([, ps]) => ps.length >= 2);
})();

function multiQuestion() {
  const [prod, pairs] = MULTI[(Math.random() * MULTI.length) | 0];
  const good = pairs.map(([i, j]) => `${i}×${j}`);
  // 干擾項：積接近但不等於的組合
  const bad = new Set();
  while (bad.size < 4) {
    const i = 1 + ((Math.random() * 9) | 0), j = 1 + ((Math.random() * 9) | 0);
    const [lo, hi] = i <= j ? [i, j] : [j, i];
    if (lo * hi !== prod) bad.add(`${lo}×${hi}`);
  }
  const chips = [...good, ...bad].sort(() => Math.random() - 0.5);
  return { prod, good, chips };
}

function playMulti(ctx, q) {
  return abortable(new Promise(resolve => {
    const t0 = performance.now();
    let done = false;

    ctx.stage.innerHTML = '';
    ctx.stage.appendChild(ctx.comboNode);

    const eq = el('div', 'eq');
    eq.appendChild(el('div', 'slot', '□'));
    eq.appendChild(el('div', 'op', '×'));
    eq.appendChild(el('div', 'slot', '□'));
    eq.appendChild(el('div', 'op', '='));
    eq.appendChild(el('div', '', String(q.prod)));
    ctx.stage.appendChild(eq);
    ctx.stage.appendChild(el('div', 'found',
      `這個數字有 ${q.good.length} 種拆法，全部找出來`));

    const wrap = el('div', 'pairs');
    const nodes = q.chips.map(c => {
      const n = el('div', 'pair', c.replace('×', ' × '));
      n.dataset.k = c;
      n.addEventListener('click', () => {
        if (done) return; sfx.tap(); n.classList.toggle('sel');
      });
      wrap.appendChild(n);
      return n;
    });
    ctx.stage.appendChild(wrap);

    const btn = el('button', 'btn block lg', '確認送出');
    btn.addEventListener('click', finish);
    ctx.input.innerHTML = '';
    ctx.input.appendChild(btn);

    async function finish() {
      if (done) return;
      done = true; btn.disabled = true;
      const ms = Math.round(performance.now() - t0);
      const picked = nodes.filter(n => n.classList.contains('sel')).map(n => n.dataset.k);
      const ok = picked.length === q.good.length && picked.every(k => q.good.includes(k));
      // 揭曉出錯也一定要 resolve，否則整關卡死
      try {
        nodes.forEach(n => {
          const isGood = q.good.includes(n.dataset.k);
          n.classList.remove('sel');
          if (isGood) n.classList.add('good');
          else if (picked.includes(n.dataset.k)) n.classList.add('bad');
        });
        ok ? sfx.correct() : sfx.wrong();
      } catch (e) { console.error('reverse 揭曉失敗', e); }
      await sleep(ok ? 900 : 1700);
      resolve({ ok, ms, given: picked.join(',') });
    }
  }), ctx.signal);
}

export async function run(ctx) {
  ctx.setTitle(meta.name);
  ctx.setScore(0);
  ctx.showTimer(false);
  sfx.start();

  const { sub, release } = subCtx(ctx);
  const startedAt = Date.now();
  let correct = 0, total = 0, msSum = 0, msN = 0, combo = 0, best = 0;
  const recent = [];

  try {
    for (let i = 0; i < N_Q; i++) {
      const isMulti = i > 0 && i % 3 === 2;             // 每三題來一題多解型
      let r, logRow;

      if (isMulti) {
        const q = multiQuestion();
        r = await playMulti(sub, q);
        logRow = { mode: meta.id, qtype: 'factor', a: null, b: null,
                   prompt: `?x?=${q.prod}`, given: r.given,
                   answer: q.good.join(','), ok: r.ok, ms: r.ms };
      } else {
        const [a, b] = pick(ctx.store, { avoid: recent });
        recent.push(ctx.store.key(a, b));
        if (recent.length > 4) recent.shift();
        r = await askNumber(sub, {
          tokens: [{ slot: 1 }, { t: '×', op: 1 }, { t: b }, { t: '=', op: 1 }, { t: a * b }],
          answer: a, maxLen: 1
        });
        ctx.store.recordFact(a, b, r.ok, r.ms);
        logRow = { mode: meta.id, qtype: 'reverse', a, b,
                   prompt: `?x${b}=${a * b}`, given: r.given,
                   answer: a, ok: r.ok, ms: r.ms };
      }

      total++;
      ctx.log(logRow);
      if (r.ok) {
        correct++; combo++; best = Math.max(best, combo);
        msSum += r.ms; msN++;
        ctx.setScore(correct);
        if (combo >= 3) { ctx.hitCombo(combo); sfx.combo(combo); }
      } else combo = 0;
    }
  } catch (e) {
    if (e.name !== 'Abort') throw e;
  } finally { release(); ctx.showTimer(true); }

  if (ctx.signal.aborted) throw new Abort();

  return {
    mode: meta.id, name: meta.name,
    total, correct, score: correct, bestCombo: best,
    startedAt, endedAt: Date.now(), msSum, msN,
    hero: `${correct}/${total}`, heroCap: '答 對 題 數',
    stats: [
      ['正確率', total ? Math.round(correct / total * 100) + '%' : '—'],
      ['最長連對', best],
      ['平均秒數', msN ? (msSum / msN / 1000).toFixed(1) : '—']
    ],
    pbHit: false,
    stars: correct * 4
  };
}
