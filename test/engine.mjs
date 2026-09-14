// node 沒有 localStorage，補一個假的
globalThis.localStorage = { _d:{}, getItem(k){return this._d[k]??null}, setItem(k,v){this._d[k]=v}, removeItem(k){delete this._d[k]} };
// node 24 已內建 crypto.randomUUID

const { store } = await import('../js/store.js');
const { pick, level, pool, maybeUnlock, stageProgress, plausibleWrong } = await import('../js/engine.js');

let fail = 0;
const t = (name, cond) => { console.log(`${cond?'✓':'✗'} ${name}`); if(!cond) fail++; };

/* ---------- 1. 弱題必須比強題常出現 ---------- */
store.load();
store.s.menu = 'speed';
// 把 3×4 練成很熟，7×8 練成很弱
for (let i=0;i<8;i++) store.recordFact(3,4,true,1200);
for (let i=0;i<6;i++) store.recordFact(7,8,false,6000);
// 其他都給中等
for (let a=1;a<=9;a++) for(let b=1;b<=9;b++){
  if((a===3&&b===4)||(a===7&&b===8)) continue;
  store.recordFact(a,b,true,2600); store.recordFact(a,b,true,2600);
}
const N = 20000, cnt = {};
for (let i=0;i<N;i++){ const [a,b]=pick(store); const k=`${a}x${b}`; cnt[k]=(cnt[k]||0)+1; }
const weak = cnt['7x8']||0, strong = cnt['3x4']||0, avg = N/81;
console.log(`   7×8(弱)=${weak}  3×4(熟)=${strong}  平均=${avg.toFixed(0)}`);
t('弱題出現頻率高於平均', weak > avg*1.5);
t('弱題出現頻率高於熟題', weak > strong);
t('熟題仍會出現（保底 20%，不會完全消失）', strong > avg*0.15);
t('熟練題數量不足時不會被重複轟炸', strong < avg*3);
t('全部 81 格都抽得到', Object.keys(cnt).length === 81);

/* ---------- 2. Leitner 分箱 ---------- */
store.reset(); store.s.menu='speed';
let f = store.fact(6,7);
for(let i=0;i<5;i++) store.recordFact(6,7,true,1500);
t('連對 5 次 → box 到頂', f.box===5 && f.streak===5);
t('連對 5 次且夠快 → 判定為金色(自動化)', level(store.s, f)===3);
store.recordFact(6,7,false,3000);
t('答錯 → box 歸 1、連對歸零', f.box===1 && f.streak===0);
t('答錯後不再是金色', level(store.s,f)!==3);

/* ---------- 3. 快但錯不能被當成熟練 ---------- */
store.reset(); store.s.menu='speed';
const g = store.fact(8,9);
store.recordFact(8,9,false,400);   // 亂按，很快但錯
t('快速答錯 → ema 至少被記成 5 秒（不會誤判成熟練）', g.ema >= 5000);

/* ---------- 4. 題庫範圍 ----------
   2026-08-16 起 config.STAGED_UNLOCK = false：兩個菜單都直接開全 81 題。
   STAGES 階梯與 maybeUnlock 的邏輯都還在，把開關轉回 true 就會恢復分階段。 */
store.reset(); store.s.menu='accuracy'; store.s.stage=0;
t('A 生(accuracy)也直接開全 81 題', pool(store.s).length===81);
for (const [a,b] of pool(store.s)) for(let i=0;i<5;i++) store.recordFact(a,b,true,1500);
t('全部練到金色 → 進度 100%', Math.round(stageProgress(store)*100)===100);
t('階梯關掉時 maybeUnlock 不動 s.stage', maybeUnlock(store)===null && store.s.stage===0);
store.s.menu='speed';
t('S 生(speed)直接開全 81 題', pool(store.s).length===81);

/* ---------- 5. 似是而非的錯誤選項 ---------- */
let bad=0, dup=0;
for(let i=0;i<3000;i++){
  const a=1+(Math.random()*9|0), b=1+(Math.random()*9|0);
  const w = plausibleWrong(a,b);
  if (w === a*b) dup++;
  if (w<=0 || w>100) bad++;
}
t('錯誤選項不會等於正解', dup===0);
t('錯誤選項都在合理範圍 (1~100)', bad===0);

/* ---------- 6. streak 與補回卡 ---------- */
store.reset();
const day = n => { const d=new Date(Date.now()-n*86400000); const z=x=>String(x).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; };
store.s.streak = { n:5, last:day(1), freezes:1, week:store.isoWeek() };
t('連續第二天 → +1', store.bumpStreak().n===6);
store.s.streak = { n:5, last:day(2), freezes:1, week:store.isoWeek() };
const r = store.bumpStreak();
t('漏一天 + 有補回卡 → 連續不中斷', r.n===6 && r.used===true && store.s.streak.freezes===0);
store.s.streak = { n:5, last:day(2), freezes:0, week:store.isoWeek() };
t('漏一天 + 沒補回卡 → 歸 1', store.bumpStreak().n===1);
store.s.streak = { n:9, last:day(0), freezes:1, week:store.isoWeek() };
t('同一天重複完成 → 不重複計數', store.bumpStreak().n===9);

console.log(`\n${fail?'✗ 失敗 '+fail+' 項':'✓ 全部通過'}`);
process.exit(fail?1:0);
