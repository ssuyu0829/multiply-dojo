/* ============================================================
   設定檔
   ------------------------------------------------------------
   SUPABASE_URL / SUPABASE_ANON_KEY 填好之後，作答資料會自動
   同步到雲端；留空則遊戲仍完全可玩，資料只存在裝置本機。

   ⚠ 這裡的 key 是「可以公開」的 publishable key，放進公開 repo 沒問題。
     真正的保護在資料庫：anon 對 students / sessions / attempts 三張表
     零權限（RLS 全開且無 policy），只能呼叫 push / pull / leaderboard
     三個函式，而且每個都要帶對 uuid token。詳見 schema.sql。
     絕不可以把 service_role key 放進這個檔案。
   ============================================================ */

export const SUPABASE_URL      = 'https://tpljcoguqaukjtoxeyay.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_IaAXQNfXyHWdgbhlxn-nYg_HWoh1uxs';

/* 熟練度門檻（毫秒）—— 依菜單不同 */
export const TARGET_MS = { accuracy: 4000, speed: 2500 };
export const GOLD_MS   = { accuracy: 3500, speed: 2500 };

/* 分階段解鎖總開關。
   2026-08-16 關掉：A 生首日 97.9% 正確、平均 3.55 秒（快於她 4 秒的目標），
   卡在 1、2、5 段是空轉。轉回 true 就會照下面的 STAGES 重新分階段，
   孩子存檔裡的 s.stage 不會被動到，所以隨時可以反悔。 */
export const STAGED_UNLOCK = false;

/* 分階段解鎖的階梯：一次丟 81 題對剛學完的小二可能太挫折。
   目前 STAGED_UNLOCK = false，這張表沒有生效，留給以後真的需要慢慢來的學生。
   ⚠ 只能用 1~9。整個 App（9×9 點亮圖、逆推關的單位數輸入）都以九九乘法為前提，
     放 10 進來會出現點亮圖看不到、逆推關打不出兩位數答案的問題。 */
export const STAGES = [
  { name: '1、2、5 段', tables: [1, 2, 5] },
  { name: '3、4 段',    tables: [1, 2, 5, 3, 4] },
  { name: '6、8 段',    tables: [1, 2, 5, 3, 4, 6, 8] },
  { name: '全部九九',   tables: [1, 2, 3, 4, 5, 6, 7, 8, 9] }
];

export const AVATARS = ['🐯','🦊','🐼','🦄','🐙','🦖','🐧','🐝','🦋','🐳'];

export const THEMES = [
  { id: 'default', name: '霓虹青',   stars: 0   },
  { id: 'ember',   name: '烈焰橘',   stars: 60  },
  { id: 'mint',    name: '薄荷綠',   stars: 150 },
  { id: 'bubble',  name: '泡泡粉',   stars: 300 }
];
