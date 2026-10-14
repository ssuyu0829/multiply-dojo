/* ============================================================
   util.js — 不碰 DOM 的小工具（Node 測試也能 import）
   ============================================================ */

/** Fisher–Yates 原地洗牌（sort(() => Math.random() - 0.5) 的分布有偏差，不要用） */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
