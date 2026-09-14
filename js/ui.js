/* ============================================================
   ui.js — DOM 小工具、鍵盤、算式舞台、點亮圖、特效
   ============================================================ */

import { level as facLevel } from './engine.js';
import { sfx } from './sound.js';

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

export function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  // 遊玩畫面鎖住捲動，確保鍵盤整排都在視野內
  document.body.classList.toggle('playing', id === 's-play');
  window.scrollTo(0, 0);
}

/* ---------------- toast ---------------- */
let toastT = null;
export function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), ms);
}

/* ---------------- 粒子噴發 ---------------- */
export function burst(x, y, n = 18, colors) {
  const host = $('#burst');
  const cs = colors || ['#35e0d6', '#ffc247', '#a6e22e', '#9d7bff'];
  for (let i = 0; i < n; i++) {
    const s = el('div', 'spark');
    const ang = Math.random() * Math.PI * 2;
    const d = 70 + Math.random() * 150;
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.background = cs[(Math.random() * cs.length) | 0];
    s.style.setProperty('--dx', Math.cos(ang) * d + 'px');
    s.style.setProperty('--dy', (Math.sin(ang) * d + 60) + 'px');
    host.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}
export function burstAt(node, n = 18) {
  const r = node.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, n);
}

/* ============================================================
   算式舞台
   tokens: [{t:'7'} | {t:'×',op:1} | {slot:1}]
   ============================================================ */
export function renderEq(tokens, typed) {
  const eq = el('div', 'eq');
  for (const tk of tokens) {
    if (tk.slot) {
      const s = el('div', 'slot' + (typed ? ' filled' : ''), typed || '?');
      eq.appendChild(s);
    } else {
      eq.appendChild(el('div', tk.op ? 'op' : '', tk.t));
    }
  }
  return eq;
}

/* ============================================================
   數字鍵盤 —— 自製大按鈕，不叫出系統鍵盤
   ============================================================ */
/**
 * 數字鍵盤。noDel = true 時左下角留空
 * （直式關是逐格自動判定，沒有「刪除」這個動作，
 *   留一顆按了沒反應的鍵只會讓小孩困惑）
 */
export function keypad({ onDigit, onDel, onSubmit, submitLabel = '✓', noDel = false }) {
  const k = el('div', 'keypad');
  // 用 data-k 定位，不要用索引 —— 少一顆鍵就會整排錯位
  const mk = (label, cls, key, fn) => {
    const b = el('button', 'key' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.dataset.k = key;
    b.addEventListener('click', e => { e.preventDefault(); sfx.tap(); fn(b); });
    k.appendChild(b);
    return b;
  };
  for (let i = 1; i <= 9; i++) mk(String(i), '', 'd' + i, () => onDigit(i));
  if (noDel) k.appendChild(el('div'));                     // 佔位，維持三欄對齊
  else mk('⌫', 'del', 'del', () => onDel());
  mk('0', '', 'd0', () => onDigit(0));
  const sub = mk(submitLabel, 'act', 'submit', () => onSubmit());
  k.submitBtn = sub;
  return k;
}

/* ============================================================
   9×9 點亮圖
   ============================================================ */
export function renderGrid(host, store, { unlocked = null, highlight = null } = {}) {
  const s = store.s;
  host.innerHTML = '';
  host.appendChild(el('div', 'hd', ''));
  for (let b = 1; b <= 9; b++) host.appendChild(el('div', 'hd', String(b)));

  for (let a = 1; a <= 9; a++) {
    host.appendChild(el('div', 'hd', String(a)));
    for (let b = 1; b <= 9; b++) {
      const key = store.key(a, b);
      const lv = facLevel(s, s.facts[key]);
      const locked = unlocked && !unlocked.includes(a);
      const c = el('div', 'cell' + (locked ? ' locked' : lv ? ' l' + lv : ''));
      c.style.animationDelay = ((a * 9 + b) * 5) + 'ms';
      c.title = `${a} × ${b} = ${a * b}`;
      if (highlight && highlight.has(key)) {
        c.style.outline = '2px solid #fff';
        c.style.outlineOffset = '1px';
      }
      host.appendChild(c);
    }
  }
}

/* ============================================================
   等待 / 中止
   ============================================================ */
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export class Abort extends Error {
  constructor() { super('abort'); this.name = 'Abort'; }
}

/**
 * 建一個「子中止器」：關卡自己可以喊停（例如 60 秒到了），
 * 同時上層的退出鍵也仍然能中止。
 * 回傳 {sub, ac, release}
 */
export function subCtx(ctx) {
  const ac = new AbortController();
  const onUp = () => ac.abort();
  ctx.signal.addEventListener('abort', onUp, { once: true });
  return {
    ac,
    sub: Object.assign(Object.create(Object.getPrototypeOf(ctx)), ctx, { signal: ac.signal }),
    release: () => ctx.signal.removeEventListener('abort', onUp)
  };
}

/** 讓 signal 中止時 reject */
export function abortable(promise, signal) {
  if (!signal) return promise;
  return new Promise((res, rej) => {
    if (signal.aborted) return rej(new Abort());
    const onAbort = () => rej(new Abort());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(v => { signal.removeEventListener('abort', onAbort); res(v); },
                 e => { signal.removeEventListener('abort', onAbort); rej(e); });
  });
}

/* ============================================================
   核心互動：問一題、等作答
   ------------------------------------------------------------
   lockMs：輸入後送出鍵鎖住的毫秒數（防手滑，強迫再看一眼）
   limitMs：作答時限，0 = 不限時
   ============================================================ */
export function askNumber(ctx, {
  tokens, answer, maxLen = 3, limitMs = 0, lockMs = 0,
  onTimeout = null, hintNode = null
}) {
  return abortable(new Promise(resolve => {
    let typed = '';
    let done = false;
    const t0 = performance.now();
    let lockT = null, limitT = null, tickT = null;

    const stage = ctx.stage;
    stage.innerHTML = '';
    stage.appendChild(ctx.comboNode);

    let eq = renderEq(tokens, typed);
    stage.appendChild(eq);
    const verdict = el('div', 'verdict', '');
    stage.appendChild(verdict);
    if (hintNode) stage.appendChild(hintNode);

    const pad = keypad({
      onDigit: d => {
        if (done || typed.length >= maxLen) return;
        typed += String(d);
        redraw();
        arm();
      },
      onDel: () => { if (done) return; typed = typed.slice(0, -1); redraw(); arm(); },
      onSubmit: () => submit(false)
    });
    ctx.input.innerHTML = '';
    ctx.input.appendChild(pad);
    pad.submitBtn.disabled = true;

    function redraw() {
      const n = renderEq(tokens, typed);
      eq.replaceWith(n);
      eq = n;
    }
    /** 防手滑：剛輸入完的 lockMs 毫秒內不能送出 */
    function arm() {
      clearTimeout(lockT);
      pad.submitBtn.disabled = true;
      if (!typed.length) return;
      if (!lockMs) { pad.submitBtn.disabled = false; return; }
      lockT = setTimeout(() => { if (!done) pad.submitBtn.disabled = false; }, lockMs);
    }

    if (limitMs) {
      const start = performance.now();
      tickT = setInterval(() => {
        const left = 1 - (performance.now() - start) / limitMs;
        ctx.setTimer(Math.max(0, left));
        if (left <= 0) { clearInterval(tickT); }
      }, 80);
      limitT = setTimeout(() => submit(true), limitMs);
    }

    function submit(timeout) {
      if (done) return;
      if (!timeout && !typed.length) return;
      done = true;
      clearTimeout(lockT); clearTimeout(limitT); clearInterval(tickT);
      const ms = Math.round(performance.now() - t0);
      const given = timeout ? null : +typed;
      const ok = !timeout && given === answer;
      pad.submitBtn.disabled = true;
      $$('.key', pad).forEach(b => b.disabled = true);

      eq.classList.add(ok ? 'ok' : 'bad');
      if (ok) {
        verdict.className = 'verdict ok';
        verdict.textContent = '答對！';
        sfx.correct();
      } else {
        verdict.className = 'verdict bad';
        verdict.innerHTML = timeout
          ? `時間到　<span class="fix">${answer}</span>`
          : `正解是　<span class="fix">${answer}</span>`;
        sfx.wrong();
        if (navigator.vibrate) navigator.vibrate(60);
      }
      if (timeout && onTimeout) onTimeout();
      setTimeout(() => resolve({ ok, given, ms, timeout }), ok ? 380 : 1250);
    }
  }), ctx.signal);
}
