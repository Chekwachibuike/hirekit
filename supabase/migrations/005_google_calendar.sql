-- ═══════════════════════════════════════════════════════════
-- HireKit — Google Calendar Sync
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Stores each user's Google OAuth tokens so we can call the Calendar API
-- on their behalf without asking them to re-authenticate every time.
create table if not exists google_calendar_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null unique,
  access_token  text not null,
  refresh_token text not null,
  expiry_date   bigint not null, -- epoch ms, when access_token expires
  calendar_id   text default 'primary',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table google_calendar_tokens enable row level security;

create policy "google_calendar_tokens: owner only"
  on google_calendar_tokens for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_google_calendar_tokens_updated_at
  before update on google_calendar_tokens
  for each row execute function set_updated_at();

-- Tracks which Google Calendar event a local event was pushed to, so
-- updates/deletes can target the right event instead of creating duplicates.
alter table calendar_events add column if not exists google_event_id text;
