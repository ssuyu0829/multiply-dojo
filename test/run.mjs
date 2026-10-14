/* ============================================================
   test/run.mjs — 依序跑全部 Node 測試（npm test 的進入點）
   任一組失敗就以非 0 結束，CI 會跟著紅。
   ============================================================ */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SUITES = [
  ['column.mjs',   '直式題產生器（600 題唯一解驗證）'],
  ['classify.mjs', '錯誤分類（進位／對位／九九本身）'],
  ['engine.mjs',   '自適應出題引擎、Leitner、streak']
];

const failed = [];
for (const [file, title] of SUITES) {
  console.log(`\n━━━ ${title} — test/${file}`);
  const r = spawnSync(process.execPath, [join(here, file)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(file);
}

console.log('\n══════════════════════════════════════');
if (failed.length) {
  console.log(`✗ 失敗：${failed.join(', ')}`);
  process.exit(1);
}
console.log(`✓ ${SUITES.length} 組測試全部通過`);
