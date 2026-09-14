/* ============================================================
   main.js — 主流程：首頁、每日任務、結算、週榜
   ============================================================ */

import { store } from './store.js';
import { sync } from './sync.js';
import { sfx } from './sound.js';
import { AVATARS, THEMES, STAGED_UNLOCK } from './config.js';
import { unlockedTables, stageName, stageProgress, maybeUnlock, level as facLevel } from './engine.js';
import { $, $$, el, show, toast, renderGrid, burst, Abort } from './ui.js';

import * as Sprint  from './modes/sprint60.js';
import * as Perfect from './modes/perfect.js';
import * as BugHunt from './modes/bughunt.js';
import * as Reverse from './modes/reverse.js';
import * as Column  from './modes/columnpuzzle.js';
import * as Weekly  from './modes/weekly.js';

const MODES = {
  sprint60: Sprint, perfect: Perfect, bughunt: BugHunt,
  reverse: Reverse, column: Column, weekly: Weekly
};

/* ============================================================
   每日菜單
   ------------------------------------------------------------
   A 生（accuracy）：純九九，重準確率與細心
   S 生（speed）   ：速度衝刺 + 動腦題 + 直式（她討厭重複計算）
   週日兩人都跑全表挑戰
   ============================================================ */
function dailyPlan(s) {
  const d = new Date();
  if (d.getDay() === 0) return ['sprint60', 'weekly'];
  if (s.menu === 'accuracy') return ['sprint60', 'perfect', 'bughunt'];
  const alt = Math.floor(Date.now() / 86400000) % 2;    // 主關隔日輪替，避免膩
  return ['sprint60', alt ? 'reverse' : 'bughunt', 'column'];
}

/* ============================================================
   啟動
   ============================================================ */
let queue = [];        // 今日還沒跑的關卡
let lastResult = null;
let sessionId = null;
let running = null;    // 目前的 AbortController

boot();

async function boot() {
  const q = new URLSearchParams(location.search);
  const token = q.get('t');
  const m = q.get('m');

  store.use(token);
  store.load();

  if (token) store.s.token = token;
  if (m) store.s.menu = (m === 'a' || m === 'accuracy') ? 'accuracy' : 'speed';

  // 這台裝置沒有存檔、但雲端有 → 把進度拉回來
  if (token && !store.s.nick && sync.enabled()) {
    const remote = await sync.pull(token);
    if (remote && remote.nick) {
      Object.assign(store.s, remote, { token, queueA: store.s.queueA, queueS: store.s.queueS });
      toast('已從雲端還原進度');
    }
  }

  sfx.setMuted(!!store.s.muted);
  applyTheme();
  store.save();
  sync.init(store);
  wire();

  if (!store.s.nick) startSetup(); else goHome();

  // iOS 需要一次使用者互動才允許播放聲音
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

  // 本機開發時不要註冊 Service Worker —— 它會把舊版程式碼鎖死，
  // 讓人以為是遊戲有 bug（踩過一次了）。
  const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator) {
    if (isDev) {
      const regs = await navigator.serviceWorker.getRegistrations();
      regs.forEach(r => r.unregister());
      if (window.caches) (await caches.keys()).forEach(k => caches.delete(k));
    } else {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
}

function applyTheme() {
  const t = store.s.theme || 'default';
  if (t === 'default') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ============================================================
   第一次啟動
   ============================================================ */
function startSetup() {
  const host = $('#avatarPick');
  host.innerHTML = '';
  let chosen = store.s.avatar || AVATARS[0];
  AVATARS.forEach(a => {
    const n = el('div', 'pick' + (a === chosen ? ' sel' : ''), a);
    n.addEventListener('click', () => {
      chosen = a;
      $$('.pick', host).forEach(x => x.classList.remove('sel'));
      n.classList.add('sel');
      sfx.tap();
    });
    host.appendChild(n);
  });
  $('#nickInput').value = store.s.nick || '';
  $('#setupGo').onclick = () => {
    const nick = $('#nickInput').value.trim();
    if (!nick) { toast('先取個名字吧'); $('#nickInput').focus(); return; }
    store.s.nick = nick;
    store.s.avatar = chosen;
    store.save();
    sfx.clear();
    goHome();
  };
  show('s-setup');
}

/* ============================================================
   首頁
   ============================================================ */
function goHome() {
  const s = store.s;
  $('#homeAvatar').textContent = s.avatar;
  $('#homeNick').textContent = s.nick;
  $('#homeMenu').textContent = stageName(s) +
    (s.menu === 'accuracy' && STAGED_UNLOCK ? `　·　${Math.round(stageProgress(store) * 100)}% 金色` : '');
  $('#homeStreak').querySelector('.n').textContent = s.streak.n;
  $('#muteBtn').textContent = s.muted ? '🔇' : '🔊';

  $('#pbSprint').textContent  = s.pb.sprint60 || 0;
  $('#pbPerfect').textContent = s.pb.perfect || 0;
  $('#starCount').textContent = s.stars || 0;

  const plan = dailyPlan(s);
  const done = store.day().modes;
  queue = plan.filter(m => !done.includes(m));

  const list = $('#questList');
  list.innerHTML = '';
  plan.forEach((id, i) => {
    const M = MODES[id];
    const isDone = done.includes(id);
    const isNow = !isDone && queue[0] === id;
    const n = el('div', 'quest' + (isDone ? ' done' : isNow ? ' now' : ''));
    n.innerHTML =
      `<div class="dot">${isDone ? '✓' : i + 1}</div>
       <div class="t"><b>${M.meta.icon} ${M.meta.name}</b><span>${M.meta.desc}</span></div>`;
    list.appendChild(n);
  });

  const allDone = queue.length === 0;
  $('#questHeading').textContent = allDone ? '今日任務 — 完成 ✓' : '今日任務';
  $('#startBtn').textContent = allDone ? '再玩一次（不影響紀錄）' : '開始今日任務';
  $('#startBtn').onclick = () => {
    if (allDone) { showFree(); return; }
    runQueue();
  };

  renderGrid($('#mgrid'), store, { unlocked: unlockedTables(s) });
  const p = pool8(s);
  $('#gridNote').innerHTML = s.menu === 'accuracy' && STAGED_UNLOCK
    ? `目前解鎖 <b>${stageName(s)}</b>　·　${Math.round(stageProgress(store) * 100)}% 已自動化，到 80% 解鎖下一段`
    : `<b>${p.gold}</b> / 81 格已自動化`;

  show('s-home');
}

function pool8(s) {
  let gold = 0;
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++)
    if (facLevel(s, s.facts[store.key(a, b)]) === 3) gold++;
  return { gold };
}

/* ============================================================
   遊玩主機
   ============================================================ */
/* combo 節點會被各關卡的 stage.innerHTML='' 清掉又接回去。
   在這裡抓一次固定的參考，之後不再從 DOM 找，避免拿到 null。 */
const COMBO = $('#combo');

function makeCtx() {
  const ac = new AbortController();
  running = ac;
  sessionId = store.uuid();
  const timer = $('#playTimer');
  timer.style.visibility = 'visible';
  timer.classList.remove('warn');
  $('#playTimer i').style.width = '100%';

  return {
    store,
    signal: ac.signal,
    stage: $('#playStage'),
    input: $('#playInput'),
    comboNode: COMBO,
    setTitle: t => { $('#playTitle').textContent = t; },
    setScore: v => { $('#playScore').textContent = v; },
    setTimer: f => { $('#playTimer i').style.width = (f * 100) + '%'; },
    warnTimer: b => { timer.classList.toggle('warn', !!b); },
    showTimer: b => { timer.style.visibility = b ? 'visible' : 'hidden'; },
    hitCombo(n) {
      COMBO.textContent = '×' + n;
      COMBO.classList.remove('hit'); void COMBO.offsetWidth; COMBO.classList.add('hit');
    },
    flashBanner: txt => toast(txt),
    log(row) {
      store.queueAttempt({
        sid: sessionId,
        mode: row.mode, qtype: row.qtype,
        a: row.a ?? null, b: row.b ?? null,
        prompt: row.prompt ?? null,
        given: row.given == null ? null : String(row.given),
        answer: String(row.answer),
        ok: !!row.ok,
        ms: row.ms | 0,
        hint: !!row.hint,
        tag: row.tag || null,
        at: new Date().toISOString()
      });
    }
  };
}

async function play(modeId, { counts = true, queued = false } = {}) {
  const M = MODES[modeId];
  const ctx = makeCtx();
  $('#playStage').innerHTML = '';
  $('#playInput').innerHTML = '';
  show('s-play');

  let res;
  try {
    res = await M.run(ctx);
  } catch (e) {
    if (e instanceof Abort || e.name === 'Abort') { goHome(); return null; }
    console.error(e);
    toast('這一關出了點問題，先回主畫面');
    goHome();
    return null;
  } finally { running = null; }

  res.counts = counts;
  store.tally(res);
  store.queueSession({
    id: sessionId, mode: res.mode,
    started_at: new Date(res.startedAt).toISOString(),
    ended_at: new Date(res.endedAt).toISOString(),
    total: res.total, correct: res.correct,
    score: typeof res.score === 'number' ? res.score : 0,
    best_combo: res.bestCombo || 0,
    counts,
    device: navigator.userAgent.slice(0, 120)
  });

  const newThemes = store.addStars(res.stars || 0);
  const unlocked = counts ? maybeUnlock(store) : null;
  store.save();
  sync.flush();

  showResult(res, { newThemes, unlocked, queued });
  return res;
}

/* 今日任務：一關接一關。
   「下一關」的按鈕行為直接由佇列狀態決定 —— 不要用 promise 交接，
   因為結算頁是在 play() 內部就顯示的，外面的 resolver 還沒接上。 */
function runQueue() {
  if (!queue.length) return finishDay();
  play(queue[0], { queued: true });
}

/* ============================================================
   結算
   ============================================================ */
function showResult(res, { newThemes = [], unlocked = null, queued = false } = {}) {
  lastResult = res;
  $('#resBig').textContent = res.hero;
  $('#resCap').textContent = res.heroCap;

  const st = $('#resStats');
  st.innerHTML = '';
  res.stats.forEach(([k, v]) => {
    st.appendChild(el('div', 'stat', `<b>${v}</b><span>${k}</span>`));
  });

  const bg = $('#resBadges');
  bg.innerHTML = '';
  const badges = [];
  if (res.pbHit) badges.push('🏆 ' + (res.pbLabel || '破紀錄'));
  if (res.total && res.correct === res.total && res.total >= 5) badges.push('💯 全部答對');
  if (res.bestCombo >= 10) badges.push(`🔥 連對 ${res.bestCombo}`);
  if (res.stars) badges.push(`⭐ +${res.stars}`);
  if (unlocked) badges.push('🔓 解鎖 ' + unlocked);
  newThemes.forEach(t => badges.push('🎨 解鎖主題「' + t.name + '」'));
  badges.forEach(b => bg.appendChild(el('div', 'badge', b)));

  if (res.pbHit) {
    sfx.record();
    setTimeout(() => burst(innerWidth / 2, innerHeight * 0.3, 34), 200);
  }
  if (unlocked) toast('解鎖新階段：' + unlocked, 3200);

  // queue[0] 是剛打完的這一關，所以「還剩幾關」要扣掉自己
  const remaining = queued ? queue.length - 1 : 0;
  const btn = $('#resNext');
  if (!queued) {
    btn.textContent = '回主畫面';
    btn.onclick = goHome;
  } else if (remaining > 0) {
    const nextMode = MODES[queue[1]];
    btn.textContent = `下一關：${nextMode.meta.icon} ${nextMode.meta.name} →`;
    btn.onclick = () => { queue.shift(); runQueue(); };
  } else {
    btn.textContent = '完成今日任務 →';
    btn.onclick = () => { queue.shift(); finishDay(); };
  }
  show('s-result');
}

/* ============================================================
   一日完成
   ============================================================ */
function finishDay() {
  const d = store.day();
  d.done = true;
  const st = store.bumpStreak();
  store.save();
  sync.flush();
  sfx.clear();

  $('#dayStreak').textContent = st.n;
  $('#dayMsg').innerHTML = st.used
    ? '昨天沒練，用掉了一張<b>補回卡</b>　·　連續紀錄保住了！'
    : st.broke
      ? '中斷過沒關係，今天重新開始 💪'
      : `今天練了 <b>${Math.round(d.sec / 60)}</b> 分鐘，答了 <b>${d.att}</b> 題`;

  renderGrid($('#dayGrid'), store, { unlocked: unlockedTables(store.s) });

  const bg = $('#dayBadges');
  bg.innerHTML = '';
  const acc = d.att ? Math.round(d.cor / d.att * 100) : 0;
  bg.appendChild(el('div', 'badge', `✅ 今日正確率 ${acc}%`));
  if (st.n >= 3) bg.appendChild(el('div', 'badge', `🔥 連續 ${st.n} 天`));
  if (acc === 100) bg.appendChild(el('div', 'badge', '💎 今天零失誤'));

  setTimeout(() => burst(innerWidth / 2, innerHeight * 0.28, 40), 300);
  show('s-daydone');
}

/* ============================================================
   姐妹週榜
   ============================================================ */
function progressScore(s) {
  const now = store.isoWeek();
  const prev = store.isoWeek(new Date(Date.now() - 7 * 86400000));
  const c = s.weekHist[now], p = s.weekHist[prev];
  if (!c) return 0;
  const accNow = c.att ? c.cor / c.att : 0;
  const accPrev = (p && p.att) ? p.cor / p.att : accNow;
  const msNow = c.msN ? c.msSum / c.msN : 0;
  const msPrev = (p && p.msN) ? p.msSum / p.msN : msNow;
  const clamp = v => Math.max(-1, Math.min(1, v));
  const speedGain = (msPrev && msNow) ? clamp((msPrev - msNow) / msPrev) : 0;
  const accGain = clamp(accNow - accPrev);
  return Math.round(speedGain * 40 + accGain * 40 + (c.days.length / 7) * 20);
}

async function showRank() {
  const host = $('#rankList');
  host.innerHTML = '<p class="hint">載入中…</p>';
  show('s-rank');

  const mine = progressScore(store.s);
  let rows = null;
  if (sync.enabled() && store.s.token) rows = await sync.leaderboard(store.s.token);

  if (!rows || !rows.length) {
    host.innerHTML = '';
    host.appendChild(el('div', 'rank-row me',
      `<div class="pos">1</div>
       <div class="t" style="flex:1"><b>${store.s.avatar} ${store.s.nick}</b>
       <div style="font-size:12px;color:var(--fg-faint)">本週練了 ${(store.s.weekHist[store.isoWeek()]?.days.length) || 0} 天</div></div>
       <div class="sc">${mine}</div>`));
    host.appendChild(el('p', 'hint',
      sync.enabled() ? '目前拿不到姐妹的資料（可能還沒連上網路）' : '尚未連線雲端，只顯示自己的分數'));
    return;
  }

  rows.sort((a, b) => b.score - a.score);
  host.innerHTML = '';
  rows.forEach((r, i) => {
    const isMe = r.is_me;
    host.appendChild(el('div', 'rank-row' + (isMe ? ' me' : ''),
      `<div class="pos">${i + 1}</div>
       <div class="t" style="flex:1"><b>${r.name}</b>
       <div style="font-size:12px;color:var(--fg-faint)">本週練了 ${r.days} 天</div></div>
       <div class="sc">${r.score}</div>`));
  });
}

/* ============================================================
   自由練習
   ============================================================ */
function showFree() {
  const host = $('#freeList');
  host.innerHTML = '';
  Object.entries(MODES).forEach(([id, M]) => {
    const n = el('div', 'quest');
    n.innerHTML = `<div class="dot">${M.meta.icon}</div>
      <div class="t"><b>${M.meta.name}</b><span>${M.meta.desc}</span></div>`;
    n.addEventListener('click', () => play(id, { counts: false }));
    host.appendChild(n);
  });
  show('s-free');
}

/* ============================================================
   事件接線
   ============================================================ */
function wire() {
  $('#quitBtn').onclick = () => {
    if (running) running.abort();
    goHome();
  };
  $('#muteBtn').onclick = () => {
    store.s.muted = !store.s.muted;
    sfx.setMuted(store.s.muted);
    store.save();
    $('#muteBtn').textContent = store.s.muted ? '🔇' : '🔊';
    if (!store.s.muted) sfx.tap();
  };
  $('#dayHome').onclick = goHome;
  $('#rankBtn').onclick = showRank;
  $('#rankBack').onclick = goHome;
  $('#freeBtn').onclick = showFree;
  $('#freeBack').onclick = goHome;

  // 電腦上可以直接用實體鍵盤（用 data-k 找，不用索引）
  document.addEventListener('keydown', e => {
    if (!$('#s-play').classList.contains('on')) return;
    const key = k => $(`#playInput .key[data-k="${k}"]`);
    if (e.key >= '0' && e.key <= '9') key('d' + e.key)?.click();
    else if (e.key === 'Backspace') { e.preventDefault(); key('del')?.click(); }
    else if (e.key === 'Enter') { e.preventDefault(); key('submit')?.click(); }
  });

  // 主題切換（長按星星數）
  let holdT = null;
  $('#starCount').parentElement.addEventListener('pointerdown', () => {
    holdT = setTimeout(cycleTheme, 600);
  });
  ['pointerup', 'pointerleave'].forEach(ev =>
    $('#starCount').parentElement.addEventListener(ev, () => clearTimeout(holdT)));
}

function cycleTheme() {
  const un = store.unlockedThemes();
  if (un.length < 2) { toast('累積 60 顆星星解鎖新主題'); return; }
  const i = un.findIndex(t => t.id === (store.s.theme || 'default'));
  const next = un[(i + 1) % un.length];
  store.s.theme = next.id;
  store.save();
  applyTheme();
  toast('主題：' + next.name);
}

/* 除錯用：在 console 打 dojo.reset() 清空存檔 */
window.dojo = { store, sync, reset: () => { store.reset(); location.reload(); } };
