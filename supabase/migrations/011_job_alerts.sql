-- ═══════════════════════════════════════════════════════════
-- Job alerts: saved searches checked daily, so a new opening (a Shell
-- graduate programme, an electrical role in Lagos) is surfaced as soon as
-- it is posted instead of when the user next thinks to search.
--
--   job_alerts          the saved search (its validated query string)
--   job_alert_matches   every posting an alert has seen; unseen rows are
--                       what the bell and the alerts panel show as new
-- ═══════════════════════════════════════════════════════════

create table if not exists job_alerts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  name             text not null check (char_length(name) between 1 and 120),
  -- The /api/job-search query string, re-validated on every run.
  params           text not null check (char_length(params) <= 1000),
  active           boolean not null default true,
  email            boolean not null default true,
  last_checked_at  timestamptz,
  last_error       text,
  created_at       timestamptz default now()
);

create index if not exists job_alerts_due on job_alerts (active, last_checked_at nulls first);

alter table job_alerts enable row level security;

create policy "job_alerts: owner only"
  on job_alerts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists job_alert_matches (
  alert_id    uuid references job_alerts(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  job_key     text not null,
  title       text not null,
  company     text,
  location    text,
  url         text not null,
  source      text,
  posted      date,
  -- Matches recorded when the alert is created are the baseline: they were
  -- already open, so they are not announced as new.
  seen        boolean not null default false,
  found_at    timestamptz default now(),
  primary key (alert_id, job_key)
);

create index if not exists job_alert_matches_unseen on job_alert_matches (user_id, seen);

alter table job_alert_matches enable row level security;

create policy "job_alert_matches: owner only"
  on job_alert_matches for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
