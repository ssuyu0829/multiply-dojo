/* ============================================================
   engine.js — 自適應出題引擎
   ------------------------------------------------------------
   Leitner 分箱 + 三重權重（錯誤率／反應時間／複習間隔）。
   保底 20% 抽已熟的題：維持自動化，也避免整場都是難題造成挫折。
   ============================================================ */

import { STAGES, STAGED_UNLOCK, TARGET_MS, GOLD_MS } from './config.js';

/* box → 建議複習間隔（毫秒）。box 越高越久才回來。 */
const IVL = [0, 30e3, 2 * 60e3, 10 * 60e3, 60 * 60e3, 24 * 3600e3];

export function targetMs(s) { return TARGET_MS[s.menu] ?? 3000; }
export function goldMs(s)   { return GOLD_MS[s.menu] ?? 2800; }

/** 目前解鎖的乘數表 */
export function unlockedTables(s) {
  if (s.menu !== 'accuracy' || !STAGED_UNLOCK) return [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return STAGES[Math.min(s.stage, STAGES.length - 1)].tables;
}

export function stageName(s) {
  if (s.menu !== 'accuracy' || !STAGED_UNLOCK) return '全部九九乘法';
  return STAGES[Math.min(s.stage, STAGES.length - 1)].name;
}

/** 目前題庫：[[a,b], ...] */
export function pool(s) {
  const tabs = unlockedTables(s);
  const out = [];
  for (const a of tabs) for (let b = 1; b <= 9; b++) out.push([a, b]);
  return out;
}

/** 熟練度 0=沒練 1=學習中 2=熟練 3=自動化(金色) */
export function level(s, f) {
  if (!f || (f.c + f.w) === 0) return 0;
  if (f.streak >= 5 && f.box >= 5 && f.ema && f.ema <= goldMs(s)) return 3;
  if (f.box >= 3) return 2;
  return 1;
}

/** 近 5 次錯誤率 */
function errRate(f) {
  if (!f.hist.length) return 0.5;                    // 沒資料 → 中性偏高，先讓它出現
  return 1 - f.hist.reduce((x, y) => x + y, 0) / f.hist.length;
}

function weight(s, f, now, tgt) {
  const wErr   = 1 + 3 * errRate(f);
  const wSpeed = f.ema ? 1 + Math.max(0, (f.ema - tgt) / tgt) : 1.6;
  const due    = now - (f.last || 0);
  const ivl    = IVL[Math.min(f.box, 5)];
  const wDue   = f.last ? Math.min(3, 0.25 + due / Math.max(ivl, 1)) : 3;
  return wErr * wSpeed * wDue;
}

/**
 * 抽一題九九乘法。
 * @param {object} store
 * @param {object} opt  {avoid:[key], onlyPool:[[a,b]]}
 * @returns {[number, number]}
 */
export function pick(store, opt = {}) {
  const s = store.s;
  const now = Date.now();
  const tgt = targetMs(s);
  const list = opt.onlyPool || pool(s);
  const avoid = new Set(opt.avoid || []);

  // 20% 保底：從已熟的題裡抽，維持手感與信心。
  // ⚠ 熟練的題不夠多時必須跳過，否則那一兩題會被重複轟炸。
  if (Math.random() < 0.2) {
    const mastered = list.filter(([a, b]) => {
      const f = s.facts[store.key(a, b)];
      return f && f.box >= 3 && !avoid.has(store.key(a, b));
    });
    if (mastered.length >= 6) return mastered[(Math.random() * mastered.length) | 0];
  }

  const cand = list.filter(([a, b]) => !avoid.has(store.key(a, b)));
  const use = cand.length ? cand : list;

  let total = 0;
  const ws = use.map(([a, b]) => {
    const w = weight(s, store.fact(a, b), now, tgt);
    total += w;
    return w;
  });
  let r = Math.random() * total;
  for (let i = 0; i < use.length; i++) { r -= ws[i]; if (r <= 0) return use[i]; }
  return use[use.length - 1];
}

/** 該題的作答時限（毫秒）— 越不熟給越多時間 */
export function timeLimit(store, a, b) {
  const f = store.s.facts[store.key(a, b)];
  const tgt = targetMs(store.s);
  if (!f || !f.ema) return tgt * 2.2;
  return Math.min(tgt * 2.4, Math.max(tgt * 1.2, f.ema * 1.9));
}

/** 目前階段的完成度 0~1（金色格子佔比） */
export function stageProgress(store) {
  const s = store.s;
  const p = pool(s);
  let gold = 0;
  for (const [a, b] of p) if (level(s, s.facts[store.key(a, b)]) === 3) gold++;
  return p.length ? gold / p.length : 0;
}

/** 達 80% 金色就解鎖下一階段。回傳新階段名稱或 null */
export function maybeUnlock(store) {
  const s = store.s;
  if (!STAGED_UNLOCK) return null;      // 階梯關掉時不要去動 s.stage，才能無痛轉回來
  if (s.menu !== 'accuracy') return null;
  if (s.stage >= STAGES.length - 1) return null;
  if (stageProgress(store) < 0.8) return null;
  s.stage++;
  return STAGES[s.stage].name;
}

/**
 * 產生「似是而非」的錯誤答案 — 隨機亂數沒有訓練效果。
 * 一定要是孩子真的會犯的錯。
 */
export function plausibleWrong(a, b) {
  const right = a * b;
  const cands = new Set();
  cands.add(a * (b + 1));           // 差一段
  cands.add(a * (b - 1));
  cands.add((a + 1) * b);
  cands.add((a - 1) * b);
  cands.add(right + 10);            // 進位錯
  cands.add(right - 10);
  if (right >= 10) {                // 數字顛倒
    const rev = +String(right).split('').reverse().join('');
    cands.add(rev);
  }
  const ok = [...cands].filter(v => v > 0 && v !== right && v <= 100);
  return ok.length ? ok[(Math.random() * ok.length) | 0] : right + 1;
}
