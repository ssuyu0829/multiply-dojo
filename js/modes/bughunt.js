/* ============================================================
   找錯誤 —— A 生的 Boss 關（治粗心）
   6 個算式裡有 2~3 個是錯的，30 秒內全部揪出來。
   錯誤選項一定要「似是而非」，隨機亂數沒有訓練效果。
   ============================================================ */

import { pick, plausibleWrong } from '../engine.js';
import { el, abortable, subCtx, Abort, sleep } from '../ui.js';
import { sfx } from '../sound.js';

export const meta = { id: 'bughunt', name: '找錯誤', desc: '揪出算錯的算式', icon: '🔍' };

const ROUNDS = 3;
const PER_ROUND = 6;
const ROUND_MS = 30000;

function makeRound(store) {
  const items = [];
  const used = new Set();
  const nBad = 2 + ((Math.random() * 2) | 0);          // 2 或 3 個是錯的
  for (let i = 0; i < PER_ROUND; i++) {
    const [a, b] = pick(store, { avoid: [...used] });
    used.add(store.key(a, b));
    items.push({ a, b, right: a * b, bad: false });
  }
  // 隨機挑 nBad 個換成似是而非的錯誤答案
  const idx = items.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, nBad);
  for (const i of idx) {
    items[i].bad = true;
    items[i].shown = plausibleWrong(items[i].a, items[i].b);
  }
  items.forEach(it => { if (!it.bad) it.shown = it.right; });
  return items;
}

function playRound(ctx, items) {
  return abortable(new Promise(resolve => {
    const t0 = performance.now();
    let done = false, timer = null, tick = null;

    ctx.stage.innerHTML = '';
    ctx.stage.appendChild(ctx.comboNode);
    ctx.stage.appendChild(el('div', 'hint',
      `這裡有 <b>${items.filter(i => i.bad).length}</b> 個算錯了，把它們點出來`));

    const wrap = el('div', 'bugs');
    const nodes = items.map(it => {
      const n = el('div', 'bug', `${it.a} × ${it.b} = ${it.shown}`);
      n.addEventListener('click', () => {
        if (done) return;
        sfx.tap();
        n.classList.toggle('sel');
      });
      wrap.appendChild(n);
      return n;
    });
    ctx.stage.appendChild(wrap);

    const btn = el('button', 'btn block lg', '確認送出');
    btn.addEventListener('click', () => finish(false));
    ctx.input.innerHTML = '';
    ctx.input.appendChild(btn);

    const start = performance.now();
    tick = setInterval(() => {
      const left = 1 - (performance.now() - start) / ROUND_MS;
      ctx.setTimer(Math.max(0, left));
      ctx.warnTimer(left < 0.25);
      if (left <= 0) { clearInterval(tick); }
    }, 100);
    timer = setTimeout(() => finish(true), ROUND_MS);

    async function finish(timeout) {
      if (done) return;
      done = true;
      clearTimeout(timer); clearInterval(tick); ctx.warnTimer(false);
      btn.disabled = true;
      const ms = Math.round(performance.now() - t0);

      let allRight = true;
      // 揭曉過程若丟例外，絕不能讓 promise 永遠不 resolve（那會整關卡死）
      try {
        items.forEach((it, i) => {
          const picked = nodes[i].classList.contains('sel');
          const judged = picked === it.bad;           // 判斷正確與否
          if (!judged) allRight = false;
          nodes[i].classList.remove('sel');
          // ⚠ classList.add('') 會丟例外，一定要分開判斷
          if (it.bad) nodes[i].classList.add(judged ? 'right' : 'missed');
          else if (picked) nodes[i].classList.add('wrongpick');
          it.judged = judged;
        });
        if (allRight && !timeout) sfx.clear(); else sfx.wrong();
      } catch (e) {
        console.error('bughunt 揭曉失敗', e);
      }

      await sleep(1800);
      resolve({ allRight: allRight && !timeout, ms, items });
    }
  }), ctx.signal);
}

export async function run(ctx) {
  ctx.setTitle(meta.name);
  ctx.setScore(0);
  sfx.start();

  const { sub, release } = subCtx(ctx);
  const startedAt = Date.now();
  let cleared = 0, total = 0, correct = 0;

  try {
    for (let r = 0; r < ROUNDS; r++) {
      const items = makeRound(ctx.store);
      const res = await playRound(sub, items);
      if (res.allRight) { cleared++; ctx.setScore(cleared); }
      for (const it of items) {
        total++;
        if (it.judged) correct++;
        // 找錯誤關的秒數不代表回想速度 → ms 傳 0，只更新分箱
        ctx.store.recordFact(it.a, it.b, it.judged, 0);
        ctx.log({ mode: meta.id, qtype: 'bug', a: it.a, b: it.b,
                  prompt: `${it.a}x${it.b}=${it.shown}`,
                  given: it.judged ? 'ok' : 'miss',
                  answer: it.bad ? 'wrong-eq' : 'right-eq',
                  ok: it.judged, ms: 0 });
      }
    }
  } catch (e) {
    if (e.name !== 'Abort') throw e;
  } finally { release(); }

  if (ctx.signal.aborted) throw new Abort();

  const isPB = ctx.store.pb('bughunt', cleared);
  return {
    mode: meta.id, name: meta.name,
    total, correct, score: cleared, bestCombo: 0,
    startedAt, endedAt: Date.now(), msSum: 0, msN: 0,
    hero: `${cleared}/${ROUNDS}`, heroCap: '過 關 回 合',
    stats: [
      ['判斷正確', `${correct}/${total}`],
      ['正確率', total ? Math.round(correct / total * 100) + '%' : '—'],
      ['最佳', ctx.store.s.pb.bughunt]
    ],
    pbHit: isPB && cleared > 0, pbLabel: '找錯誤新紀錄',
    stars: cleared * 12 + correct
  };
}
