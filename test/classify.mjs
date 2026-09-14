import { classifyError } from '../js/column.js';

// 手工組一題 47 × 6 = 282，挖十位（正解 8）
const dig = n => String(n).split('').map(Number);
const right = (ds,W,end=W-1)=>{const c=new Array(W).fill(null);
  for(let i=0;i<ds.length;i++)c[end-ds.length+1+i]={d:ds[i]};return c;};
const W=3;
const mp = right(dig(6),W); mp[W-1-1]={sign:'×'};
const p = { level:1, mcand:47, mplier:6, W,
  rows:[{kind:'mcand',cells:right(dig(47),W)},
        {kind:'mplier',cells:mp},
        {kind:'rule'},
        {kind:'total',cells:right(dig(282),W)}] };
const blank = { r:3, c:1, ans:8 };

const cases = [
  [4, 'carry', '忘記進位（4×6=24 沒加上進位的 4）'],
  [2, 'align', '抄到隔壁欄的數字'],
  [7, 'fact',  '九九乘法本身算錯']
];
let fail=0;
for (const [given, want, why] of cases) {
  const got = classifyError(p, blank, given);
  const ok = got===want;
  if(!ok) fail++;
  console.log(`${ok?'✓':'✗'} 學生填 ${given} → ${got}（預期 ${want}）  ${why}`);
}
process.exit(fail?1:0);
