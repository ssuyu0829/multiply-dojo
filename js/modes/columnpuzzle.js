/* ============================================================
   直式填空謎題 —— S 生的 Boss 關
   像數獨一樣推理，而不是重複計算。
   每題都驗證過唯一解；答錯會分類成 進位／對位／九九本身。
   ============================================================ */

import { generate, classifyError, carryHints } from '../column.js';
import { el, keypad, abortable, subCtx, Abort, sleep, burstAt } from '../ui.js';
import { sfx } from '../sound.js';

export const meta = { id: 'column', name: '直式謎題', desc: '推理出被蓋住的數字', icon: '🧩' };

const N_PUZZLE = 3;

/** 依累積過關數決定難度 */
function levelFor(store) {
  const wins = store.s.pb.column || 0;
  return Math.min(3, 1 + Math.floor(wins / 6));
}

function playPuzzle(ctx, p) {
  return abortable(new Promise(resolve => {
    let cur = 0, wrongOnCur = 0, hintUsed = false, done = false;
    let mistakes = 0;
    const t0 = performance.now();
    const cellNodes = {};                       // 'r,c' -> node

    ctx.stage.innerHTML = '';
    ctx.stage.appendChild(ctx.comboNode);

    const box = el('div', 'col-puzzle');
    box.style.gridTemplateColumns = '1fr';

    const carryRow = el('div', 'col-row');
    carryRow.style.gridTemplateColumns = `repeat(${p.W}, 1fr)`;
    carryRow.style.fontSize = '.44em';
    carryRow.style.color = 'var(--amber)';
    carryRow.style.height = '1.1em';
    carryRow.style.visibility = 'hidden';
    for (let c = 0; c < p.W; c++) carryRow.appendChild(el('div', 'col-cell', ''));
    box.appendChild(carryRow);

    p.rows.forEach((row, r) => {
      if (!row.cells) { box.appendChild(el('div', 'col-rule')); return; }
      const rn = el('div', 'col-row');
      rn.style.gridTemplateColumns = `repeat(${p.W}, 1fr)`;
      row.cells.forEach((cell, c) => {
        const isBlank = p.blanks.some(b => b.r === r && b.c === c);
        const n = el('div', 'col-cell' + (isBlank ? ' blank' : cell && cell.sign ? ' sign' : ''),
                     isBlank ? '' : cell ? (cell.sign || cell.d) : '');
        if (isBlank) cellNodes[r + ',' + c] = n;
        rn.appendChild(n);
      });
      box.appendChild(rn);
    });
    ctx.stage.appendChild(box);

    const note = el('div', 'col-note', `還有 <b>${p.blanks.length}</b> 格　·　難度 ${p.level}`);
    ctx.stage.appendChild(note);

    /* --- 輸入區：數字鍵盤 + 提示鍵 --- */
    const pad = keypad({
      onDigit: d => answer(d),
      onDel: () => {},
      onSubmit: () => showHint(),
      submitLabel: '💡',
      noDel: true                    // 逐格自動判定，沒有刪除這個動作
    });
    pad.submitBtn.classList.remove('act');
    pad.submitBtn.style.background = 'var(--amber)';
    pad.submitBtn.style.boxShadow = '0 4px 0 #a37413';
    pad.submitBtn.style.color = 'var(--ink)';
    ctx.input.innerHTML = '';
    ctx.input.appendChild(pad);

    function focus() {
      p.blanks.forEach((b, i) => {
        const n = cellNodes[b.r + ',' + b.c];
        n.classList.toggle('cur', i === cur && !done);
      });
    }
    focus();

    function showHint() {
      if (done) return;
      hintUsed = true;
      const kind = p.rows[p.blanks[cur].r].kind;
      const hs = carryHints(p, kind);
      [...carryRow.children].forEach(n => n.textContent = '');
      hs.forEach(h => { carryRow.children[h.c].textContent = h.d; });
      carryRow.style.visibility = 'visible';
      note.innerHTML = `橘色小字是<b>進位</b>　·　用了提示這題不計星星`;
      sfx.tap();
    }

    async function answer(d) {
      if (done) return;
      const b = p.blanks[cur];
      const n = cellNodes[b.r + ',' + b.c];
      n.textContent = d;
      const ok = d === b.ans;

      ctx.log({
        mode: meta.id, qtype: 'column' + p.level,
        a: p.mcand, b: p.mplier,
        prompt: JSON.stringify({ m: p.mcand, x: p.mplier, r: b.r, c: b.c,
                                 kind: p.rows[b.r].kind, lv: p.level }),
        given: d, answer: b.ans, ok,
        ms: Math.round(performance.now() - t0),
        hint: hintUsed,
        tag: ok ? null : classifyError(p, b, d)
      });

      if (ok) {
        n.classList.remove('bad', 'cur');
        n.classList.add('ok');
        sfx.correct();
        cur++; wrongOnCur = 0;
        const left = p.blanks.length - cur;
        note.innerHTML = left ? `還有 <b>${left}</b> 格　·　難度 ${p.level}` : '';
        if (cur >= p.blanks.length) return finish();
        focus();
      } else {
        mistakes++; wrongOnCur++;
        n.classList.add('bad');
        sfx.wrong();
        if (navigator.vibrate) navigator.vibrate(60);
        await sleep(520);
        if (done) return;
        if (wrongOnCur >= 2) {                    // 卡住兩次就給答案，別讓她挫折
          n.textContent = b.ans;
          n.classList.remove('bad', 'cur');
          n.classList.add('ok');
          n.style.opacity = '.6';
          cur++; wrongOnCur = 0;
          if (cur >= p.blanks.length) return finish();
        } else {
          n.textContent = '';
          n.classList.remove('bad');
        }
        focus();
      }
    }

    async function finish() {
      done = true;
      focus();
      const clean = mistakes === 0 && !hintUsed;
      if (clean) { sfx.clear(); burstAt(box, 24); }
      else sfx.correct();
      note.innerHTML = clean ? '<b>完美！一次就對</b>'
                     : `完成　·　錯 ${mistakes} 次${hintUsed ? '、用了提示' : ''}`;
      await sleep(1400);
      resolve({ clean, mistakes, hintUsed, blanks: p.blanks.length,
                ms: Math.round(performance.now() - t0) });
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
  const lv = levelFor(ctx.store);
  const plan = [Math.max(1, lv - 1), lv, lv];

  let cleanCount = 0, totalBlanks = 0, correctBlanks = 0, mistakes = 0;

  try {
    for (let i = 0; i < N_PUZZLE; i++) {
      const p = generate(plan[i]);
      const r = await playPuzzle(sub, p);
      totalBlanks += r.blanks;
      correctBlanks += r.blanks - Math.min(r.mistakes, r.blanks);
      mistakes += r.mistakes;
      if (r.clean) { cleanCount++; ctx.setScore(cleanCount); }
    }
  } catch (e) {
    if (e.name !== 'Abort') throw e;
  } finally { release(); ctx.showTimer(true); }

  if (ctx.signal.aborted) throw new Abort();

  ctx.store.s.pb.column = (ctx.store.s.pb.column || 0) + cleanCount;

  return {
    mode: meta.id, name: meta.name,
    total: totalBlanks, correct: correctBlanks, score: cleanCount, bestCombo: 0,
    startedAt, endedAt: Date.now(), msSum: 0, msN: 0,
    hero: `${cleanCount}/${N_PUZZLE}`, heroCap: '完 美 過 關',
    stats: [
      ['目前難度', lv],
      ['總錯誤', mistakes],
      ['累積完美', ctx.store.s.pb.column]
    ],
    pbHit: cleanCount === N_PUZZLE, pbLabel: '三題全對！',
    stars: cleanCount * 15 + Math.max(0, totalBlanks - mistakes) * 2
  };
}
