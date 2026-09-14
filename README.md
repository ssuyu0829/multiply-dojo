# 九九特訓場（Multiply Dojo）

每天 5–8 分鐘的九九乘法 × 直式乘法練習 PWA。
給兩個國小中年級的家教學生實際每天使用：**S 生**（speed 菜單）與 **A 生**（accuracy 菜單）。

孩子在自己的平板/手機開網址就能玩，可「加入主畫面」變成 App。
每一次作答（題目、對錯、反應毫秒、錯誤類型）同步到 Supabase，
老師端儀表板看熱力圖、最弱題目、進步曲線。

- **零依賴**：純 ES modules，沒有 npm 套件、沒有 build step
- **離線可玩**：作答先進本機佇列，回線自動補傳
- **老師端**儀表板與資料庫 schema 放在本機，刻意不放進這個 repo

## 技術重點

1. **自適應出題**（`js/engine.js`、`js/store.js`）：每個九九乘法事實各自有 Leitner 分箱與反應時間 EMA，
   抽題權重偏向不熟與偏慢的題；錯誤選項依常見錯誤型態產生，而不是隨機數字。
2. **直式填空謎題的唯一解驗證**（`js/column.js` `isUnique()`）：每題窮舉所有（被乘數, 乘數）組合比對可見格，
   保證挖空後只有一組解；測試覆蓋 600 題。
3. **錯誤分類**：直式答錯時自動判斷是進位、對位還是九九本身出錯，老師端才看得出「錯在哪一步」。
4. **離線優先的同步**（`js/sync.js`）：本機是真相來源，作答進佇列、批次 POST 到 RPC，成功才清佇列。
5. **anon key 公開前提下的安全模型**：資料表開 RLS 但零 policy，前端只能呼叫三個驗 token 的 `SECURITY DEFINER` 函式（見下方〈安全模型〉）。

---

## 快速開始

```bash
python3 -m http.server 8099
# S 生菜單 → http://localhost:8099/?t=test&m=s
# A 生菜單 → http://localhost:8099/?t=test2&m=a

node test/column.mjs     # 直式題：600 題唯一解 + 算式正確性
node test/classify.mjs   # 錯誤分類（進位／對位／九九本身）
node test/engine.mjs     # 自適應引擎、Leitner、streak、分階段解鎖
```

瀏覽器內的關卡冒煙測試（在遊戲頁面的 console）：

```js
const t = await import('./test/browser-smoke.js'); await t.runAll();
```

在遊戲頁面 console 打 `dojo.reset()` 可清空存檔。

---

## 網址參數

| 參數 | 意義 |
|---|---|
| `?t=<token>` | 學生識別碼。**同時也是本機存檔的命名空間**，換一個值＝換一個獨立存檔 |
| `?m=a` | accuracy 菜單（A 生） |
| `?m=s` | speed 菜單（S 生，預設） |

孩子的真實姓名只存在資料庫，不出現在程式碼裡；前端只認 token。

---

## 檔案地圖

```
index.html            所有畫面（setup / home / play / result / daydone / rank / free）
css/style.css         設計系統：深藍夜色 × 街機霓虹
js/
  config.js           ★ Supabase 金鑰、難度門檻、分階段解鎖表
  store.js            localStorage 狀態（唯一真相來源）、Leitner 資料、streak、上傳佇列
  engine.js           自適應出題：抽題權重、熟練度判定、階段解鎖、似是而非的錯誤選項
  column.js           直式題產生器 + 唯一解驗證 + 錯誤分類
  ui.js               畫面切換、數字鍵盤、算式舞台、點亮圖、粒子特效、askNumber
  sound.js            Web Audio 合成音效（不需任何音檔）
  sync.js             離線佇列批次上傳 / 換裝置還原 / 週榜
  main.js             首頁、每日任務流程、結算、週榜、自由練習
  modes/              六個關卡，各自 export { meta, run(ctx) }
sw.js                 Service Worker（離線）
manifest.json         PWA
test/                 Node 測試 + 瀏覽器冒煙測試
```

---

## 架構

### 關卡介面

每個關卡是一個模組，`export const meta` 與 `export async function run(ctx)`。

```js
ctx = {
  store, signal,                 // signal 中止 = 使用者按了 ✕
  stage, input, comboNode,       // 要畫的 DOM 節點
  setTitle, setScore, setTimer, warnTimer, showTimer,
  hitCombo, flashBanner,
  log(row)                       // 記一次作答，進上傳佇列
}
```

`run()` 回傳結算資料：

```js
{ mode, name, total, correct, score, bestCombo,
  startedAt, endedAt, msSum, msN,
  hero, heroCap, stats: [[標題, 值], ...],
  pbHit, pbLabel, stars }
```

使用者中途退出時 `run()` 必須 **throw Abort**（不是回傳 null）。

### 資料流

```
作答 → store.recordFact()（本機 Leitner）
     → ctx.log() → store.queueAttempt() → localStorage
                 → sync.flush() 批次 POST 到 Supabase RPC `push`
                 → 成功才清佇列（斷網照玩，回線自動補傳）
```

**本機永遠是真相來源。雲端是 append-only 的備份與老師端資料源。**

### 安全模型

GitHub Pages 免費版要 public repo，所以 anon key 會公開。因此：

- anon 對**所有資料表零權限**（RLS 開啟但不建任何 policy）
- 前端只能呼叫三個 `SECURITY DEFINER` 函式：`push` / `pull` / `leaderboard`，且都要帶對 token
- 老師端 dashboard 用 `service_role` 金鑰，**只放本機**，不進 repo

schema 與老師端不在這個 repo。

---

## 不要打破的前提

| 前提 | 為什麼 |
|---|---|
| **`STAGES` 只能放 1~9** | 9×9 點亮圖與逆推關的單位數輸入都以九九乘法為前提 |
| **鍵盤用 `data-k` 找，不要用陣列索引** | 直式關少一顆 ⌫ 鍵，用索引會讓「0」變成送出鍵 |
| **`classList.add()` 不能傳空字串** | 會丟例外，而且如果在 promise 裡就永遠不 resolve → 整關卡死 |
| **自訂 promise 流程一定要 try/catch 包住 DOM 操作** | 同上，例外會讓關卡永久卡住 |
| **保底抽題要求熟練題 ≥ 6 個** | 不然剛開始只有一兩題熟，那一題會被重複轟炸 |
| **遊玩畫面用 `body.playing` 鎖捲動** | 不鎖的話手機上鍵盤最後一排（送出鍵）會被切掉 |
| **SW 對程式碼要網路優先** | 快取優先會讓更新要開兩次才生效，開發時更會整個被舊版鎖死 |
| **結算頁按鈕由 `queue` 狀態決定** | 不要用 promise 交接：結算頁在 `play()` 內部就顯示了，外層 resolver 還沒接上 |
| **找錯誤關的秒數不能當回想速度** | `recordFact(a,b,ok,0)`：ms 傳 0 只更新分箱，不動 ema |
| **直式題每題都要過唯一解驗證** | `column.js` 的 `isUnique()`，窮舉所有 (被乘數, 乘數) 比對可見格 |

---

## 兩人菜單

在 `js/main.js` 的 `dailyPlan()`：

| | A 生（accuracy） | S 生（speed） |
|---|---|---|
| 第 1 關 | 閃電 60 秒 | 閃電 60 秒 |
| 第 2 關 | 零失誤挑戰 | 逆推挑戰／找錯誤（隔日輪替） |
| 第 3 關 | 找錯誤 | 直式填空謎題 |
| 題庫 | 分階段解鎖 1,2,5 → 3,4 → 6,8 → 全部 | 一開始就全 81 題 |
| 反應目標 | 4.0 秒 | 2.5 秒 |
| 週日 | 全表挑戰（計時） | 同左 |

設計理由（來自學生檔案）：

- A 生**快但粗心** → 零失誤關答錯即結束、送出鍵鎖 300ms 強迫再看一眼、找錯誤關練檢查
- S 生**慢但聰明、討厭重複計算** → 純計算壓到只有暖身 60 秒，主餐是推理型題目

---

## 部署

```bash
git init && git add -A && git commit -m "九九特訓場 v1"
gh repo create multiply-dojo --public --source=. --push
gh api -X POST repos/{owner}/multiply-dojo/pages -f build_type=legacy \
   -F 'source[branch]=main' -F 'source[path]=/'
```

之後更新只要 `git push`，孩子下次開啟就是新版。
改版時記得把 `sw.js` 的 `VERSION` 加一，舊快取會自動清掉。

---

## 授權

`fonts/` 內的 Bungee 與 Chakra Petch 採 SIL Open Font License 1.1，
允許自行架設與再散布，詳見 `fonts/LICENSE.txt`。
