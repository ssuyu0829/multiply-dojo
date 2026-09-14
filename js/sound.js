/* ============================================================
   sound.js — Web Audio 合成音效（不需要任何音檔，維持零依賴）
   ============================================================ */

let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 單顆音 */
function tone(freq, dur, { type = 'triangle', vol = 0.18, delay = 0, slideTo = 0 } = {}) {
  const c = ac(); if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** 短噪音（打擊感） */
function noise(dur = 0.09, vol = 0.12) {
  const c = ac(); if (!c || muted) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1400;
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

const S = 1.0594630943592953;                 // 半音比
const note = n => 440 * Math.pow(S, n);       // n = 相對 A4 的半音數

export const sfx = {
  setMuted(m) { muted = m; },
  isMuted() { return muted; },
  /** 使用者第一次互動時呼叫，解鎖 iOS 的音訊 */
  unlock() { const c = ac(); if (c && c.state === 'suspended') c.resume(); },

  tap()   { tone(note(4), 0.045, { type: 'square', vol: 0.05 }); },
  correct() {
    tone(note(7),  0.10, { vol: 0.16 });
    tone(note(12), 0.16, { vol: 0.13, delay: 0.055 });
  },
  wrong() {
    tone(note(-8), 0.20, { type: 'sawtooth', vol: 0.11, slideTo: note(-16) });
    noise(0.07, 0.07);
  },
  /** combo 越高音階越上去 */
  combo(n) {
    const step = Math.min(n, 12);
    tone(note(7 + step), 0.11, { type: 'square', vol: 0.10 });
    tone(note(11 + step), 0.13, { type: 'square', vol: 0.07, delay: 0.05 });
  },
  tick()  { tone(note(-2), 0.035, { type: 'square', vol: 0.04 }); },
  warn()  { tone(note(0), 0.09, { type: 'square', vol: 0.08 }); },
  start() {
    [0, 4, 7].forEach((n, i) => tone(note(n), 0.13, { delay: i * 0.07, vol: 0.13 }));
  },
  /** 過關 */
  clear() {
    [0, 4, 7, 12].forEach((n, i) => tone(note(n), 0.30, { delay: i * 0.10, vol: 0.16 }));
  },
  /** 破紀錄 */
  record() {
    [12, 16, 19, 24].forEach((n, i) =>
      tone(note(n), 0.42, { delay: i * 0.085, vol: 0.17, type: 'triangle' }));
    noise(0.3, 0.06);
  },
  /** 陣亡 */
  fail() {
    [0, -3, -7, -12].forEach((n, i) =>
      tone(note(n), 0.24, { delay: i * 0.13, vol: 0.12, type: 'sawtooth' }));
  }
};
