import { generate, verify, classifyError, carryHints } from '../js/column.js';

let fail = 0, n = 0;
const counts = {1:0,2:0,3:0};
const t0 = Date.now();

for (const level of [1,2,3]) {
  for (let i = 0; i < 200; i++) {
    const p = generate(level);
    n++;
    counts[p.level]++;
    // 1. 唯一解
    if (!verify(p)) { console.log('✗ 非唯一解', level, p.mcand, p.mplier, p.blanks.map(b=>b.r+','+b.c)); fail++; continue; }
    // 2. 算式本身正確
    if (p.level === 3) {
      const total = p.rows.find(r=>r.kind==='total').cells.filter(Boolean).map(c=>c.d).join('');
      if (+total !== p.mcand*p.mplier) { console.log('✗ 總和錯', p.mcand, p.mplier, total); fail++; }
      const pp1 = p.rows.find(r=>r.kind==='pp1').cells.filter(Boolean).map(c=>c.d).join('');
      if (+pp1 !== p.mcand*(p.mplier%10)) { console.log('✗ 部分積1錯'); fail++; }
      const pp2 = p.rows.find(r=>r.kind==='pp2').cells.filter(Boolean).map(c=>c.d).join('');
      if (+pp2 !== p.mcand*Math.floor(p.mplier/10)) { console.log('✗ 部分積2錯'); fail++; }
    } else {
      const total = p.rows.find(r=>r.kind==='total').cells.filter(Boolean).map(c=>c.d).join('');
      if (+total !== p.mcand*p.mplier) { console.log('✗ 乘積錯', p.mcand, p.mplier, total); fail++; }
    }
    // 3. 挖空數量
    const want = p.level===1?2:p.level===2?2:[3,4];
    const okN = Array.isArray(want) ? want.includes(p.blanks.length) : p.blanks.length===want;
    if (!okN) { console.log('✗ 挖空數量', p.level, p.blanks.length); fail++; }
    // 4. 難度2必須有一格在被乘數/乘數
    if (p.level===2) {
      const has = p.blanks.some(b => ['mcand','mplier'].includes(p.rows[b.r].kind));
      if (!has) { console.log('✗ 難度2沒有反推格'); fail++; }
    }
    // 5. 錯誤分類不會爆
    for (const b of p.blanks) {
      for (let g=0; g<=9; g++) if (g!==b.ans) classifyError(p,b,g);
    }
    carryHints(p);
  }
}

// 錯誤分類抽樣：47×6 忘記進位 → 242（正解 282），十位那格填 4 應判 carry
console.log('\n分類抽樣：');
{
  const p = generate(1);
  console.log(`  ${p.mcand} × ${p.mplier} = ${p.mcand*p.mplier}，挖空 ${p.blanks.length} 格`);
}

console.log(`\n共 ${n} 題（L1:${counts[1]} L2:${counts[2]} L3:${counts[3]}），失敗 ${fail}，耗時 ${Date.now()-t0}ms`);
process.exit(fail ? 1 : 0);
