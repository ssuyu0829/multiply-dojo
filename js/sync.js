/* ============================================================
   sync.js — 離線佇列 + 雲端同步
   ------------------------------------------------------------
   本機永遠是真相來源。雲端只是 append-only 的備份與老師端資料源。
   斷網照玩，回線自動補傳，成功才清佇列。

   所有寫入都走 RPC（push），anon 對任何資料表都沒有直接權限。
   ============================================================ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const on = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/* 資料庫的 token 欄位是 uuid，非 uuid 的 ?t=（例如試玩用的 ?t=demo）送上去
   會被 PostgREST 擋成 400，佇列永遠清不掉、同步點一直紅。這種存檔一律當本機玩。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cloudToken = t => typeof t === 'string' && UUID_RE.test(t);

async function rpc(fn, body, ms = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${fn} ${res.status} ${await res.text()}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

/** 上傳時要排除的本機欄位（佇列本身不必上雲） */
function snapshot(s) {
  const { queueA, queueS, ...rest } = s;
  return rest;
}

export const sync = {
  store: null,
  busy: false,
  timer: null,

  init(store) {
    this.store = store;
    // 沒設雲端、或這個存檔用的是非 uuid 的試玩 token → 灰點，不啟動輪詢
    if (!on() || !cloudToken(store?.s?.token)) { this.dot('off'); return; }
    this.timer = setInterval(() => this.flush(), 15000);
    window.addEventListener('online', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    this.flush();
  },

  enabled: on,

  dot(state) {
    const d = document.getElementById('syncDot');
    if (!d) return;
    d.className = 'sync-dot' + (state === 'pending' ? ' pending' : state === 'err' ? ' err' : '');
    d.title = { off: '未連線雲端（資料只存本機）', pending: '等待上傳', err: '上傳失敗，稍後重試', ok: '已同步' }[state] || '';
  },

  /** 把佇列送上雲。成功才清。 */
  async flush() {
    const s = this.store?.s;
    if (!on() || !s || !cloudToken(s.token) || this.busy) return;
    if (!navigator.onLine) { this.dot('pending'); return; }
    if (!s.queueA.length && !s.queueS.length) { this.dot('ok'); return; }

    this.busy = true;
    this.dot('pending');
    const A = s.queueA.slice(0, 400);
    const S = s.queueS.slice(0, 60);
    try {
      await rpc('push', {
        p_token: s.token,
        p_attempts: A,
        p_sessions: S,
        p_state: snapshot(s)
      });
      s.queueA.splice(0, A.length);
      s.queueS.splice(0, S.length);
      this.store.save();
      this.dot(s.queueA.length ? 'pending' : 'ok');
    } catch (e) {
      console.warn('sync failed (資料保留在本機，稍後重試)', e);
      this.dot('err');
    } finally { this.busy = false; }
  },

  /** 換裝置時把雲端進度拉回來 */
  async pull(token) {
    if (!on() || !cloudToken(token)) return null;
    try { return await rpc('pull', { p_token: token }); }
    catch (e) { console.warn('pull failed', e); return null; }
  },

  /** 姐妹週榜 */
  async leaderboard(token) {
    if (!on() || !cloudToken(token)) return null;
    try { return await rpc('leaderboard', { p_token: token }); }
    catch (e) { console.warn('leaderboard failed', e); return null; }
  }
};
