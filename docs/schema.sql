-- ============================================================
--  九九特訓場 — Supabase (PostgreSQL) schema
--  ------------------------------------------------------------
--  2026-10-14 自生產環境倒出（pg_get_functiondef / information_schema /
--  pg_constraint / pg_indexes），資料表、約束、索引與三個 RPC 逐字還原。
--
--  安全模型（README〈安全模型〉）：
--    1. GitHub Pages 是 public repo，anon key 必然公開。
--    2. 所以 anon 對 students / sessions / attempts 三張表「零權限」：
--       RLS 全開、刻意不建任何 policy、也沒有任何 table grant。
--    3. 前端唯一能做的是呼叫 push / pull / leaderboard 三個
--       SECURITY DEFINER 函式，而且每一個都要帶對學生的 uuid token。
--
--  老師端 dashboard（用 service_role key，只放本機）與它依賴的三個彙總
--  view（column_errors / daily_summary / fact_mastery）不在這個 repo，
--  檔尾只列出欄位供參考。
--
--  學生真實姓名只存在 students.name，不出現在前端程式碼。
-- ============================================================


-- ------------------------------------------------------------
--  資料表
-- ------------------------------------------------------------

-- 學生：token 是前端唯一的身分憑證（網址 ?t=），state 是整份本機存檔的
-- 雲端備份（換裝置時由 pull 拉回）。cohort 把同一家的孩子分成一組，
-- 週榜只在同 cohort 內互比。
create table students (
  id          uuid        primary key default gen_random_uuid(),
  token       uuid        not null unique default gen_random_uuid(),
  name        text        not null,
  grade       text,
  menu        text        not null default 'speed'
                          check (menu in ('accuracy', 'speed')),
  cohort      text        not null default 'default',
  state       jsonb,
  state_at    timestamptz,
  created_at  timestamptz not null default now()
);
create unique index students_name_cohort on students (name, cohort);

-- 場次：一關一筆。id 由前端產生（uuid），同一場重傳用 id 去重。
-- counts = false 代表自由練習，不算今日任務。
create table sessions (
  id          uuid        primary key,
  student_id  uuid        not null references students (id) on delete cascade,
  mode        text        not null,
  started_at  timestamptz,
  ended_at    timestamptz,
  total       integer     default 0,
  correct     integer     default 0,
  score       integer     default 0,
  best_combo  integer     default 0,
  counts      boolean     default true,
  device      text,
  created_at  timestamptz not null default now()
);
create index sessions_student_time on sessions (student_id, started_at desc);

-- 作答：每按一次送出一筆，老師端分析的最小單位。
-- cid 是前端產生的 client id，離線佇列重傳時靠它去重。
-- error_tag：直式題答錯時的分類 carry / align / fact（見 js/column.js classifyError）。
create table attempts (
  id              bigserial   primary key,
  cid             uuid        not null unique,
  student_id      uuid        not null references students (id) on delete cascade,
  session_id      uuid,
  mode            text        not null,
  qtype           text        not null,
  a               integer,
  b               integer,
  prompt          text,
  answer_given    text,
  answer_correct  text,
  is_correct      boolean     not null,
  response_ms     integer,
  hint_used       boolean     default false,
  error_tag       text,
  answered_at     timestamptz not null default now()
);
create index attempts_fact         on attempts (student_id, a, b);
create index attempts_student_time on attempts (student_id, answered_at desc);


-- ------------------------------------------------------------
--  權限：anon 對資料表零權限
-- ------------------------------------------------------------

-- RLS 開啟、不建任何 policy → 即使拿到 anon key 也讀不到、寫不進任何一列。
alter table students enable row level security;
alter table sessions enable row level security;
alter table attempts enable row level security;

-- Supabase 預設會把 public schema 的表 grant 給 anon / authenticated，要明確收回。
revoke all on students, sessions, attempts from anon, authenticated;


-- ------------------------------------------------------------
--  RPC：前端唯一的入口（js/sync.js）
--  三個都是 SECURITY DEFINER（以擁有者權限執行、繞過 RLS），
--  並鎖定 search_path 避免被同名物件劫持。
-- ------------------------------------------------------------

-- push：把離線佇列裡的 sessions / attempts 批次寫入，並更新 state 備份。
-- 回傳實際新增的 attempts 筆數。
CREATE OR REPLACE FUNCTION public.push(p_token uuid, p_attempts jsonb DEFAULT '[]'::jsonb, p_sessions jsonb DEFAULT '[]'::jsonb, p_state jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student uuid;
  v_count   int := 0;
begin
  select id into v_student from students where token = p_token;
  if v_student is null then
    raise exception 'unknown token';
  end if;

  -- 場次（同一場可能重傳，用 id 去重）
  insert into sessions (id, student_id, mode, started_at, ended_at,
                        total, correct, score, best_combo, counts, device)
  select (r->>'id')::uuid, v_student, r->>'mode',
         (r->>'started_at')::timestamptz, (r->>'ended_at')::timestamptz,
         coalesce((r->>'total')::int, 0), coalesce((r->>'correct')::int, 0),
         coalesce((r->>'score')::int, 0), coalesce((r->>'best_combo')::int, 0),
         coalesce((r->>'counts')::boolean, true), r->>'device'
  from jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb)) as r
  on conflict (id) do update
     set ended_at = excluded.ended_at, total = excluded.total,
         correct = excluded.correct, score = excluded.score,
         best_combo = excluded.best_combo;

  -- 作答（cid 去重，重傳不會產生重複資料）
  insert into attempts (cid, student_id, session_id, mode, qtype, a, b, prompt,
                        answer_given, answer_correct, is_correct, response_ms,
                        hint_used, error_tag, answered_at)
  select (r->>'cid')::uuid, v_student, nullif(r->>'sid','')::uuid,
         r->>'mode', r->>'qtype',
         nullif(r->>'a','')::int, nullif(r->>'b','')::int, r->>'prompt',
         r->>'given', r->>'answer',
         coalesce((r->>'ok')::boolean, false),
         coalesce((r->>'ms')::int, 0),
         coalesce((r->>'hint')::boolean, false),
         nullif(r->>'tag',''),
         coalesce((r->>'at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_attempts, '[]'::jsonb)) as r
  on conflict (cid) do nothing;

  get diagnostics v_count = row_count;

  if p_state is not null then
    update students set state = p_state, state_at = now() where id = v_student;
  end if;

  return v_count;
end;
$function$
;

-- pull：換裝置時把雲端備份的存檔拉回來。token 不對就回 null。
CREATE OR REPLACE FUNCTION public.pull(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select state from students where token = p_token;
$function$
;

-- leaderboard：同 cohort 的週榜。比的是「這週比上週進步多少」，
-- 公式與前端 js/main.js progressScore() 一致：
--   反應時間變快 ×40 ＋ 正確率提升 ×40 ＋ 練習天數 ×20
CREATE OR REPLACE FUNCTION public.leaderboard(p_token uuid)
 RETURNS TABLE(name text, score integer, days integer, is_me boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid;
  v_cohort text;
begin
  select id, cohort into v_me, v_cohort from students where token = p_token;
  if v_me is null then raise exception 'unknown token'; end if;

  return query
  with wk as (
    select s.id, s.name,
           date_trunc('week', a.answered_at) as w,
           count(*)                                    as att,
           count(*) filter (where a.is_correct)        as cor,
           avg(a.response_ms) filter (where a.is_correct and a.response_ms > 0) as ms,
           count(distinct a.answered_at::date)         as days
    from students s
    join attempts a on a.student_id = s.id
    where s.cohort = v_cohort
      and a.answered_at >= date_trunc('week', now()) - interval '7 days'
    group by s.id, s.name, date_trunc('week', a.answered_at)
  ),
  cur as (select * from wk where w = date_trunc('week', now())),
  prv as (select * from wk where w = date_trunc('week', now()) - interval '7 days')
  select
    c.name,
    round(
      -- 反應時間變快 ×40
      greatest(-1, least(1, coalesce((p.ms - c.ms) / nullif(p.ms, 0), 0))) * 40 +
      -- 正確率提升 ×40
      greatest(-1, least(1,
        c.cor::numeric / nullif(c.att, 0) -
        coalesce(p.cor::numeric / nullif(p.att, 0), c.cor::numeric / nullif(c.att, 0))
      )) * 40 +
      -- 練習天數 ×20
      least(1, c.days::numeric / 7) * 20
    )::int as score,
    c.days::int,
    (c.id = v_me) as is_me
  from cur c
  left join prv p on p.id = c.id
  order by 2 desc;
end;
$function$
;

-- anon 唯一拿到的權限：執行這三個函式。
grant execute on function public.push(uuid, jsonb, jsonb, jsonb) to anon;
grant execute on function public.pull(uuid)                      to anon;
grant execute on function public.leaderboard(uuid)               to anon;


-- ------------------------------------------------------------
--  老師端彙總 view（定義不收錄，僅列欄位）
--  只有 service_role 會讀，anon 沒有權限。
-- ------------------------------------------------------------
--  fact_mastery  (name, student_id, a, b, tries, hits, acc_pct, avg_ms, last_seen)
--      每個九九乘法事實的熟練度 → 老師端熱力圖、最弱題目
--  daily_summary (name, student_id, day, attempts, correct, acc_pct, avg_ms, modes)
--      每日練習量、正確率、平均反應 → 進步曲線
--  column_errors (name, student_id, qtype, error_tag, n)
--      直式題錯誤分類統計（carry / align / fact）→ 看「錯在哪一步」
