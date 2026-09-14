/* ============================================================
   store.js — 本機狀態（唯一真相來源）
   雲端只是 append-only 的備份／老師端資料源。
   遊戲本身完全離線可玩。
   ============================================================ */

import { THEMES } from './config.js';

let KEY = 'dojo:v1';

function todayKey(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function dayDiff(a, b) {                       // a, b 皆為 'YYYY-MM-DD'
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const blank = () => ({
  v: 1,
  token: null,          // 學生識別碼（來自網址 ?t=），未設定則為本機試玩
  menu: 'speed',        // 'accuracy'（A 生）| 'speed'（S 生）
  nick: '',
  avatar: '🐯',
  theme: 'default',
  muted: false,
  stage: 0,             // accuracy 菜單的解鎖階段 index
  facts: {},            // 'a x b' -> {c,w,box,streak,ema,last,hist}
  days: {},             // 'YYYY-MM-DD' -> {sec,att,cor,combo,modes:[],done}
  streak: { n: 0, last: null, freezes: 1, week: null },
  pb: { sprint60: 0, perfect: 0, weekly: 0, bughunt: 0, column: 0 },
  stars: 0,
  weekHist: {},         // 'YYYY-Www' -> {att,cor,msSum,msN,days:[]}
  queueA: [],           // 待上傳 attempts
  queueS: [],           // 待上傳 sessions
  installed: Date.now()
});

export const store = {
  s: blank(),

  /** 同一台裝置上兩姐妹各自獨立的存檔空間 */
  use(token) { KEY = token ? `dojo:v1:${token.slice(0, 8)}` : 'dojo:v1'; },

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.s = Object.assign(blank(), JSON.parse(raw));
    } catch (e) { console.warn('state load failed, starting fresh', e); }
    return this.s;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); }
    catch (e) {
      // 空間滿了 → 丟掉最舊的一半佇列再試一次
      this.s.queueA = this.s.queueA.slice(-500);
      try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (_) {}
    }
  },

  reset() { this.s = blank(); this.save(); },

  /* ---------- facts ---------- */
  key: (a, b) => `${a}x${b}`,

  fact(a, b) {
    const k = this.key(a, b);
    return this.s.facts[k] ||
      (this.s.facts[k] = { c: 0, w: 0, box: 0, streak: 0, ema: 0, last: 0, hist: [] });
  },

  /**
   * 記錄一次九九乘法作答。
   * ms 傳 0 表示「這種題型的秒數不能拿來當回想速度」（例如找錯誤關），
   * 此時只更新分箱與正確率，不動 ema。
   */
  recordFact(a, b, ok, ms) {
    const f = this.fact(a, b);
    f.last = Date.now();
    f.hist.push(ok ? 1 : 0);
    if (f.hist.length > 5) f.hist.shift();
    if (ok) {
      f.c++; f.streak++;
      f.box = Math.min(5, f.box + 1);
      if (ms) f.ema = f.ema ? Math.round(f.ema * 0.65 + ms * 0.35) : ms;
    } else {
      f.w++; f.streak = 0;
      f.box = 1;
      // 答錯也讓 ema 稍微變差，避免「快但錯」被誤判成熟練
      if (ms) f.ema = f.ema ? Math.round(f.ema * 0.8 + Math.max(ms, 5000) * 0.2)
                            : Math.max(ms, 5000);
    }
    return f;
  },

  /* ---------- days ---------- */
  todayKey,
  isoWeek,

  day(k = todayKey()) {
    return this.s.days[k] ||
      (this.s.days[k] = { sec: 0, att: 0, cor: 0, combo: 0, modes: [], done: false });
  },

  /** 一場關卡結束後累積當日與當週統計 */
  tally(res) {
    const d = this.day();
    d.sec += Math.round((res.endedAt - res.startedAt) / 1000);
    d.att += res.total;
    d.cor += res.correct;
    d.combo = Math.max(d.combo, res.bestCombo || 0);
    if (res.counts !== false && !d.modes.includes(res.mode)) d.modes.push(res.mode);

    const wk = isoWeek();
    const w = this.s.weekHist[wk] || (this.s.weekHist[wk] = { att: 0, cor: 0, msSum: 0, msN: 0, days: [] });
    w.att += res.total; w.cor += res.correct;
    if (res.msSum) { w.msSum += res.msSum; w.msN += res.msN; }
    const tk = todayKey();
    if (!w.days.includes(tk)) w.days.push(tk);
  },

  /* ---------- streak ---------- */
  /** 今日任務全數完成時呼叫。回傳 {n, used, broke} */
  bumpStreak() {
    const st = this.s.streak;
    const t = todayKey();

    // 每週補一張「補回卡」（ADHD 友善：破功一次就整個放棄是最常見的失敗）
    const wk = isoWeek();
    if (st.week !== wk) { st.week = wk; st.freezes = 1; }

    if (st.last === t) return { n: st.n, used: false, broke: false };

    let used = false, broke = false;
    if (!st.last) st.n = 1;
    else {
      const gap = dayDiff(st.last, t);
      if (gap === 1) st.n++;
      else if (gap === 2 && st.freezes > 0) { st.freezes--; st.n++; used = true; }
      else { st.n = 1; broke = true; }
    }
    st.last = t;
    return { n: st.n, used, broke };
  },

  /* ---------- stars / themes ---------- */
  addStars(n) {
    this.s.stars += n;
    return THEMES.filter(t => t.stars > 0 && this.s.stars >= t.stars &&
                              this.s.stars - n < t.stars);
  },
  unlockedThemes() { return THEMES.filter(t => this.s.stars >= t.stars); },

  /* ---------- PB ---------- */
  /** dir: 'high' 越大越好 / 'low' 越小越好。回傳是否破紀錄 */
  pb(name, val, dir = 'high') {
    const cur = this.s.pb[name] || 0;
    const better = dir === 'high' ? val > cur : (cur === 0 || val < cur);
    if (better) this.s.pb[name] = val;
    return better;
  },

  /* ---------- 上傳佇列 ---------- */
  queueAttempt(row) {
    row.cid = uuid();                      // client id，供伺服器端去重
    this.s.queueA.push(row);
    if (this.s.queueA.length > 4000) this.s.queueA.splice(0, 1000);
  },
  queueSession(row) {
    row.cid = uuid();
    this.s.queueS.push(row);
    if (this.s.queueS.length > 500) this.s.queueS.splice(0, 100);
  },

  uuid
};
