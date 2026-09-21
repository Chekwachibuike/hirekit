-- ═══════════════════════════════════════════════════════════
-- HireKit — Practice history (streaks + score analysis)
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Every rated practice answer, one row. Until now the interview-prep rater
-- generated a score, showed it once and threw it away, so there was nothing
-- to build a streak or a trend from.
--
-- `topic` is the unit of analysis: the rater labels each answer ("React
-- hooks", "SQL indexing", "System design"), which is what lets the monthly
-- report say where you improved rather than only whether the average moved.
create table if not exists practice_attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  kind       text not null default 'interview'
               check (kind in ('interview', 'skill-assessment')),
  role       text,
  topic      text,
  question   text,
  score      integer not null check (score >= 0 and score <= 10),
  created_at timestamptz default now()
);

alter table practice_attempts enable row level security;

drop policy if exists "practice_attempts: owner only" on practice_attempts;
create policy "practice_attempts: owner only" on practice_attempts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Streaks and monthly rollups both read this user's rows newest-first.
create index if not exists practice_attempts_user_created
  on practice_attempts (user_id, created_at desc);

-- Per-topic trends group by topic within a date range.
create index if not exists practice_attempts_user_topic
  on practice_attempts (user_id, topic);
