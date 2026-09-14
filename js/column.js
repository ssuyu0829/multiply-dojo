/* ============================================================
   column.js — 直式乘法填空謎題
   ------------------------------------------------------------
   難度 1：2位×1位，挖答案格
   難度 2：2位×1位，挖被乘數／乘數（必須反推）
   難度 3：2位×2位，含兩層部分積與相加

   ⚠ 每一題都用「窮舉所有 (被乘數, 乘數) 組合、比對所有可見格」
     驗證過唯一解。沒有唯一解的挖法會被丟掉重生。
   ============================================================ */

const dig = n => String(n).split('').map(Number);

/** 把數字靠右排進寬度 W 的欄位 */
function right(ds, W, endCol) {
  const cells = new Array(W).fill(null);
  const end = endCol === undefined ? W - 1 : endCol;
  for (let i = 0; i < ds.length; i++) cells[end - ds.length + 1 + i] = { d: ds[i] };
  return cells;
}

/** 2位 × 1位 的版面 */
function layoutA(mcand, mplier) {
  const prod = mcand * mplier;
  const W = Math.max(3, String(prod).length);
  const mp = right(dig(mplier), W);
  mp[W - String(mplier).length - 1] = { sign: '×' };
  return {
    W,
    rows: [
      { kind: 'mcand',  cells: right(dig(mcand), W) },
      { kind: 'mplier', cells: mp },
      { kind: 'rule' },
      { kind: 'total',  cells: right(dig(prod), W) }
    ]
  };
}

/** 2位 × 2位 的版面（兩層部分積） */
function layoutB(mcand, mplier) {
  const m1 = (mplier / 10) | 0, m0 = mplier % 10;
  const pp1 = mcand * m0;
  const pp2 = mcand * m1;
  const prod = mcand * mplier;
  const W = Math.max(4, String(prod).length);
  if (String(pp2).length > W - 1) return null;      // 左移一位後放不下
  const mp = right(dig(mplier), W);
  mp[W - String(mplier).length - 1] = { sign: '×' };
  return {
    W,
    rows: [
      { kind: 'mcand',  cells: right(dig(mcand), W) },
      { kind: 'mplier', cells: mp },
      { kind: 'rule' },
      { kind: 'pp1',    cells: right(dig(pp1), W) },
      { kind: 'pp2',    cells: right(dig(pp2), W, W - 2) },
      { kind: 'rule2' },
      { kind: 'total',  cells: right(dig(prod), W) }
    ]
  };
}

const build = (level, a, b) => (level === 3 ? layoutB(a, b) : layoutA(a, b));

/** 兩個版面在「非挖空格」上是否完全一致（含空白與符號的位置） */
function matches(L, P, blankSet) {
  if (!L || L.W !== P.W || L.rows.length !== P.rows.length) return false;
  for (let r = 0; r < P.rows.length; r++) {
    const pr = P.rows[r].cells, lr = L.rows[r].cells;
    if (P.rows[r].kind !== L.rows[r].kind) return false;
    if (!pr) continue;
    for (let c = 0; c < P.W; c++) {
      const p = pr[c], l = lr[c];
      if (blankSet.has(r + ',' + c)) {
        if (!l || l.d === undefined) return false;   // 挖空處必須也是數字
        continue;
      }
      if (!p && !l) continue;
      if (!p || !l) return false;
      if (p.sign !== l.sign) return false;
      if (p.d !== l.d) return false;
    }
  }
  return true;
}

/** 窮舉驗證：可見資訊是否只對應唯一一組 (被乘數, 乘數) */
function isUnique(level, mcand, mplier, P, blanks) {
  const set = new Set(blanks.map(b => b.r + ',' + b.c));
  const bLo = level === 3 ? 12 : 2, bHi = level === 3 ? 99 : 9;
  let hits = 0;
  for (let a = 10; a <= 99; a++) {
    for (let b = bLo; b <= bHi; b++) {
      if (level === 3 && (b % 10 === 0 || b % 10 === 1)) continue;
      if (matches(build(level, a, b), P, set)) {
        hits++;
        if (hits > 1) return false;
        if (a !== mcand || b !== mplier) return false;
      }
    }
  }
  return hits === 1;
}

/** 所有可挖的數字格 */
function digitCells(P, kinds) {
  const out = [];
  P.rows.forEach((row, r) => {
    if (!row.cells || !kinds.includes(row.kind)) return;
    row.cells.forEach((c, i) => { if (c && c.d !== undefined) out.push({ r, c: i, ans: c.d }); });
  });
  return out;
}

const shuffle = arr => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * 產生一題直式謎題。
 * @param {1|2|3} level
 */
export function generate(level = 1) {
  for (let tries = 0; tries < 400; tries++) {
    let mcand, mplier, P;

    if (level === 3) {
      mcand  = 11 + ((Math.random() * 89) | 0);
      mplier = 12 + ((Math.random() * 88) | 0);
      if (mplier % 10 <= 1 || mcand % 10 === 0) continue;
      P = layoutB(mcand, mplier);
      if (!P) continue;
    } else {
      mcand  = 12 + ((Math.random() * 88) | 0);
      mplier = 3 + ((Math.random() * 7) | 0);
      if (mcand % 10 === 0) continue;                 // 尾數 0 太好猜
      if (mcand * mplier < 100) continue;             // 保持三位數答案，版面一致
      P = layoutA(mcand, mplier);
    }

    // 依難度決定可挖哪些列
    const kinds = level === 1 ? ['total']
                : level === 2 ? ['mcand', 'mplier', 'total']
                :               ['mcand', 'mplier', 'pp1', 'pp2', 'total'];
    const nBlank = level === 1 ? 2 : level === 2 ? 2 : 3 + ((Math.random() * 2) | 0);

    const cells = shuffle(digitCells(P, kinds));
    if (cells.length < nBlank) continue;

    let blanks;
    if (level === 2) {
      // 難度 2 一定要有一格挖在被乘數／乘數上，才會需要反推
      const src = cells.filter(x => ['mcand', 'mplier'].includes(P.rows[x.r].kind));
      const tot = cells.filter(x => P.rows[x.r].kind === 'total');
      if (!src.length || !tot.length) continue;
      blanks = [src[0], tot[0]];
    } else {
      blanks = cells.slice(0, nBlank);
    }

    if (!isUnique(level, mcand, mplier, P, blanks)) continue;

    blanks.sort((x, y) => (y.r - x.r) || (y.c - x.c));   // 由下而上、由右而左作答
    return {
      level, mcand, mplier, W: P.W, rows: P.rows,
      blanks: blanks.map(b => ({ ...b, given: null }))
    };
  }
  // 極端狀況的保底題
  return generate(1);
}

/* ------------------------------------------------------------
   進位提示：mcand × 單一位數 的逐位進位
   ------------------------------------------------------------ */
function carriesOf(mcand, m) {
  const ds = dig(mcand);
  const out = new Array(ds.length).fill(0);
  let carry = 0;
  for (let i = ds.length - 1; i >= 0; i--) {
    const v = ds[i] * m + carry;
    carry = (v / 10) | 0;
    out[i] = carry;                       // 進到左邊那一位的量
  }
  return out;                             // 與 mcand 的位數對齊
}

/**
 * 回傳 [{c, d}]：要顯示在被乘數上方的進位小數字。
 * @param p      題目
 * @param rowKind 目前作答中的列（'pp2' 時看的是乘數的十位）
 */
export function carryHints(p, rowKind) {
  const m = p.level !== 3 ? p.mplier
          : rowKind === 'pp2' ? ((p.mplier / 10) | 0)
          : (p.mplier % 10);
  const cs = carriesOf(p.mcand, m);
  const start = p.W - String(p.mcand).length;
  const out = [];
  for (let i = 0; i < cs.length; i++) {
    if (cs[i] > 0 && i > 0) out.push({ c: start + i - 1, d: cs[i] });
  }
  return out;
}

/* ------------------------------------------------------------
   錯誤分類 —— 老師端最有價值的資料
   carry = 忘了進位 / align = 對錯位 / fact = 九九乘法本身錯
   ------------------------------------------------------------ */
export function classifyError(p, blank, given) {
  const kind = p.rows[blank.r].kind;
  if (kind === 'mcand' || kind === 'mplier') return 'fact';

  // 「忘記進位」會產生的那個版本
  const m = kind === 'pp2' ? ((p.mplier / 10) | 0)
          : kind === 'pp1' ? (p.mplier % 10)
          : (p.level === 3 ? null : p.mplier);
  if (m) {
    const ds = dig(p.mcand);
    const noCarry = [];
    const top = ds[0] * m;
    if (top >= 10) noCarry.push((top / 10) | 0);
    for (const d of ds) noCarry.push((d * m) % 10);
    const endCol = kind === 'pp2' ? p.W - 2 : p.W - 1;
    const startCol = endCol - noCarry.length + 1;
    const idx = blank.c - startCol;
    if (idx >= 0 && idx < noCarry.length && noCarry[idx] === given && given !== blank.ans) {
      return 'carry';
    }
  }

  // 同一列相鄰欄的正確數字 → 對錯位
  const row = p.rows[blank.r].cells;
  for (const dc of [-1, 1]) {
    const n = row[blank.c + dc];
    if (n && n.d === given) return 'align';
  }
  return 'fact';
}

/** 提供給測試腳本：驗證一題確實唯一解 */
export function verify(p) {
  const P = { W: p.W, rows: p.rows };
  return isUnique(p.level, p.mcand, p.mplier, P, p.blanks);
}
