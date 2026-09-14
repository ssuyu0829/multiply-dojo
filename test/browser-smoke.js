/* ============================================================
   browser-smoke.js — 在真的瀏覽器裡把每個關卡跑一遍
   ------------------------------------------------------------
   用法（在遊戲頁面的 console）：
     const t = await import('./test/browser-smoke.js'); await t.runAll();

   會自動作答、檢查每一關都能正常結束（不會卡死），
   並回報作答紀錄有沒有正確寫進佇列。
   ============================================================ */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* 跟 main.js 一樣，只抓一次固定參考 */
const COMBO = $('#combo');

/* ---------- 從畫面上讀出題目、算出答案 ---------- */
function readEquation() {
  const eq = $('#playStage .eq');
  if (!eq) return null;
  const parts = [...eq.children];
  const slotIdx = parts.findIndex(n => n.classList.contains('slot'));
  if (slotIdx < 0) return null;
  const nums = parts.map(n =>
    n.classList.contains('slot') ? null
    : (/^\d+$/.test(n.textContent.trim()) ? +n.textContent.trim() : undefined));
  const [x, , y, , z] = nums;
  if (z === null || z === undefined) return { ans: x * y };     // a × b = ?
  if (x === null) return { ans: z / y };                        // ? × b = c
  if (y === null) return { ans: z / x };                        // a × ? = c
  return null;
}

const padKey = k => $(`#playInput .key[data-k="${k}"]`);

function clickDigit(d) {
  const b = padKey('d' + d);
  if (!b) return false;
  b.click();
  return true;
}
async function submitNumber() {
  const sub = padKey('submit');
  if (!sub) return;
  for (let i = 0; i < 30 && sub.disabled; i++) await sleep(50);   // 等防手滑鎖解開
  sub.click();
}

/* ---------- 自動玩家 ---------- */
/**
 * @param {object} o  {wrongAt:n 第幾題故意答錯, stop:()=>bool}
 */
async function autoplay(o = {}) {
  let answered = 0;
  const t0 = Date.now();

  while (!o.stop?.() && Date.now() - t0 < (o.maxMs || 120000)) {
    await sleep(90);
    if (!$('#s-play').classList.contains('on')) break;

    // --- 找錯誤 ---
    const bugs = $$('#playStage .bug');
    if (bugs.length) {
      const btn = $('#playInput .btn');
      if (!btn || btn.disabled) continue;
      bugs.forEach(n => {
        const m = n.textContent.match(/(\d+)\s*×\s*(\d+)\s*=\s*(\d+)/);
        if (m && +m[1] * +m[2] !== +m[3]) n.click();              // 這個是錯的 → 點它
      });
      await sleep(60);
      btn.click();
      answered++;
      await sleep(2100);
      continue;
    }

    // --- 逆推多解型 ---
    const pairs = $$('#playStage .pair');
    if (pairs.length) {
      const btn = $('#playInput .btn');
      if (!btn || btn.disabled) continue;
      const prod = +$('#playStage .eq').lastElementChild.textContent.trim();
      pairs.forEach(n => {
        const m = n.textContent.match(/(\d+)\s*×\s*(\d+)/);
        if (m && +m[1] * +m[2] === prod) n.click();
      });
      await sleep(60);
      btn.click();
      answered++;
      await sleep(2000);
      continue;
    }

    // --- 直式謎題：沒辦法從畫面推出答案，逐一試（錯兩次會自動揭曉並前進）---
    const blank = $('#playStage .col-cell.blank.cur');
    if (blank) {
      const sig = [...$$('#playStage .col-cell')].map(n => n.textContent).join('|');
      const d = (answered * 7 + 3) % 10;
      clickDigit(d);
      answered++;
      await sleep(650);
      continue;
    }

    // --- 一般算式題 ---
    // 上一題還在揭曉時，鍵盤是 disabled 而算式仍留著舊題目 →
    // 一定要等鍵盤重新啟用才動作，否則會對著舊題目空按。
    if (!padKey('d1') || padKey('d1').disabled) continue;

    const q = readEquation();
    if (!q) continue;

    const wrong = o.wrongAt && answered + 1 >= o.wrongAt;
    const val = wrong ? (q.ans === 1 ? 7 : 1) : q.ans;
    String(val).split('').forEach(c => clickDigit(+c));
    await sleep(40);
    await submitNumber();
    answered++;
    await sleep(wrong ? 1400 : 520);
  }
  return answered;
}

/* ---------- 建一個跟 main.js 一樣的 ctx ---------- */
async function makeCtx(store) {
  const ac = new AbortController();
  const logs = [];
  const timer = $('#playTimer');
  timer.style.visibility = 'visible';
  // 先抓 combo 再清空 stage —— 清空會把它從 DOM 上拔掉
  const combo = COMBO;
  $('#playStage').innerHTML = '';
  $('#playInput').innerHTML = '';
  document.body.classList.add('playing');
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-play'));

  return {
    ctx: {
      store, signal: ac.signal,
      stage: $('#playStage'), input: $('#playInput'), comboNode: combo,
      setTitle: t => { $('#playTitle').textContent = t; },
      setScore: v => { $('#playScore').textContent = v; },
      setTimer: f => { $('#playTimer i').style.width = (f * 100) + '%'; },
      warnTimer: () => {}, showTimer: () => {},
      hitCombo: () => {}, flashBanner: () => {},
      log: r => logs.push(r)
    },
    ac, logs
  };
}

/* ---------- 主測試 ---------- */
export async function runAll() {
  const { store } = await import('../js/store.js');
  const { sfx } = await import('../js/sound.js');
  sfx.setMuted(true);                              // 測試時安靜一點

  const results = [];
  const check = (name, ok, extra = '') => {
    results.push({ name, ok, extra });
    console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);
  };

  const MODES = {
    sprint60: await import('../js/modes/sprint60.js'),
    perfect:  await import('../js/modes/perfect.js'),
    bughunt:  await import('../js/modes/bughunt.js'),
    reverse:  await import('../js/modes/reverse.js'),
    column:   await import('../js/modes/columnpuzzle.js'),
    weekly:   await import('../js/modes/weekly.js')
  };

  /* --- 1. 零失誤：故意在第 4 題答錯，應該立刻結束 --- */
  {
    store.load(); store.s.menu = 'speed';
    const { ctx, logs } = await makeCtx(store);
    let done = false;
    const p = MODES.perfect.run(ctx).then(r => { done = true; return r; });
    await autoplay({ wrongAt: 4, stop: () => done, maxMs: 40000 });
    const r = await Promise.race([p, sleep(12000).then(() => null)]);
    check('零失誤挑戰能正常結束', !!r, r ? `連對 ${r.score} 題` : '⚠ 卡住沒回傳');
    check('零失誤：答錯即結束', !!r && r.score === 3, r ? `score=${r.score}` : '');
    check('零失誤：有寫入作答紀錄', logs.length === 4, `${logs.length} 筆`);
    check('零失誤：紀錄含反應毫秒', logs.every(l => l.ms > 0));
  }

  /* --- 2. 找錯誤（原本會卡死的那一關）--- */
  {
    const { ctx, logs } = await makeCtx(store);
    let done = false;
    const p = MODES.bughunt.run(ctx).then(r => { done = true; return r; });
    await autoplay({ stop: () => done, maxMs: 140000 });
    const r = await Promise.race([p, sleep(15000).then(() => null)]);
    check('找錯誤能正常結束（不再卡死）', !!r, r ? `過 ${r.score}/3 關` : '⚠ 卡住沒回傳');
    check('找錯誤：3 回合 × 6 題 = 18 筆紀錄', logs.length === 18, `${logs.length} 筆`);
    check('找錯誤：全部判斷正確', !!r && r.correct === 18, r ? `${r.correct}/18` : '');
  }

  /* --- 3. 逆推（含多解型）--- */
  {
    const { ctx, logs } = await makeCtx(store);
    let done = false;
    const p = MODES.reverse.run(ctx).then(r => { done = true; return r; });
    await autoplay({ stop: () => done, maxMs: 120000 });
    const r = await Promise.race([p, sleep(15000).then(() => null)]);
    check('逆推能正常結束', !!r, r ? `答對 ${r.correct}/${r.total}` : '⚠ 卡住沒回傳');
    check('逆推：10 題', !!r && r.total === 10, r ? `total=${r.total}` : '');
    check('逆推：有多解型題目', logs.some(l => l.qtype === 'factor'));
  }

  /* --- 4. 直式謎題 --- */
  {
    const { ctx, logs } = await makeCtx(store);
    let done = false;
    const p = MODES.column.run(ctx).then(r => { done = true; return r; });
    await autoplay({ stop: () => done, maxMs: 150000 });
    const r = await Promise.race([p, sleep(20000).then(() => null)]);
    check('直式謎題能正常結束', !!r, r ? `完美 ${r.score}/3` : '⚠ 卡住沒回傳');
    check('直式：有寫入作答紀錄', logs.length > 0, `${logs.length} 筆`);
    check('直式：答錯有分類 (carry/align/fact)',
      logs.filter(l => !l.ok).every(l => ['carry', 'align', 'fact'].includes(l.tag)),
      logs.filter(l => !l.ok).map(l => l.tag).join(','));
    check('直式：prompt 存得下完整題目',
      logs.every(l => { try { return !!JSON.parse(l.prompt).m; } catch { return false; } }));
  }

  /* --- 5. 全表挑戰（用A 生第一階段的 27 題，較快）--- */
  {
    store.s.menu = 'accuracy'; store.s.stage = 0;
    const { ctx, logs } = await makeCtx(store);
    let done = false;
    const p = MODES.weekly.run(ctx).then(r => { done = true; return r; });
    await autoplay({ stop: () => done, maxMs: 120000 });
    const r = await Promise.race([p, sleep(20000).then(() => null)]);
    check('全表挑戰能正常結束', !!r, r ? `${r.correct}/${r.total}` : '⚠ 卡住沒回傳');
    check('全表：跑完第一階段 27 題', !!r && r.total === 27, r ? `total=${r.total}` : '');
    store.s.menu = 'speed';
  }

  /* --- 6. 閃電 60 秒：中途退出要乾淨地丟 Abort --- */
  {
    const { ctx, ac, logs } = await makeCtx(store);
    let outcome = null;
    const p = MODES.sprint60.run(ctx).then(r => outcome = { ok: r }, e => outcome = { err: e.name });
    await autoplay({ stop: () => !!outcome, maxMs: 6000 });
    ac.abort();
    await sleep(600);
    check('閃電 60 秒：中途退出乾淨中止', outcome?.err === 'Abort', JSON.stringify(outcome));
    check('閃電 60 秒：退出前的作答仍有記錄', logs.length > 0, `${logs.length} 筆`);
  }

  const bad = results.filter(r => !r.ok);
  console.log(`\n${bad.length ? '✗ 失敗 ' + bad.length + ' 項' : '✓ 全部通過'}  (${results.length} 項檢查)`);
  return { total: results.length, failed: bad.length, failures: bad.map(b => b.name + ' ' + b.extra) };
}
