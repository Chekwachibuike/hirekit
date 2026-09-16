-- ═══════════════════════════════════════════════════════════
-- HireKit — Initial Schema + RLS
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ── Personal Info ────────────────────────────────────────────
create table if not exists personal_info (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null unique,
  full_name   text,
  email       text,
  phone       text,
  location    text,
  linkedin    text,
  github      text,
  portfolio_url text,
  summary     text,
  skills      jsonb default '[]'::jsonb,
  experience  jsonb default '[]'::jsonb,
  education   jsonb default '[]'::jsonb,
  updated_at  timestamptz default now()
);

-- ── Projects ─────────────────────────────────────────────────
create table if not exists projects (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade not null,
  title                 text not null,
  description           text,
  category              text default 'other',
  tech_stack            jsonb default '[]'::jsonb,
  github_url            text,
  live_url              text,
  image_url             text,
  featured              boolean default false,
  published_to_portfolio boolean default false,
  created_at            timestamptz default now()
);

-- ── Job Applications ─────────────────────────────────────────
create table if not exists job_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  company          text not null,
  role             text not null,
  location         text,
  status           text default 'draft'
                     check (status in ('draft','applied','interview','offer','rejected','ghosted')),
  applied_date     date,
  salary_range     text,
  notes            text,
  cover_letter_id  uuid,
  cv_version       text,
  job_url          text,
  contact_name     text,
  contact_email    text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── Cover Letters ────────────────────────────────────────────
create table if not exists cover_letters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text,
  company     text,
  role        text,
  content     text,
  tone        text default 'formal' check (tone in ('formal','confident','casual')),
  status      text default 'draft'  check (status in ('draft','final')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Interview Topics ─────────────────────────────────────────
create table if not exists interview_topics (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade not null,
  role           text,
  topic          text not null,
  subtopics      jsonb default '[]'::jsonb,
  priority       text default 'medium' check (priority in ('high','medium','low')),
  completed      boolean default false,
  scheduled_date date,
  notes          text,
  created_at     timestamptz default now()
);

-- ── Calendar Events ──────────────────────────────────────────
create table if not exists calendar_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade not null,
  title            text not null,
  type             text default 'other'
                     check (type in ('interview','deadline','study','follow_up','other')),
  date             date not null,
  time             time,
  application_id   uuid,
  notes            text,
  created_at       timestamptz default now()
);

-- ── Content Posts ────────────────────────────────────────────
create table if not exists content_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  project_id   uuid,
  platform     text not null check (platform in ('linkedin','instagram','facebook')),
  caption      text,
  image_url    text,
  status       text default 'draft' check (status in ('draft','scheduled','posted')),
  scheduled_at timestamptz,
  posted_at    timestamptz,
  created_at   timestamptz default now()
);

-- ── App Settings ─────────────────────────────────────────────
create table if not exists app_settings (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  mode    text default 'manual' check (mode in ('manual','auto')),
  target_roles jsonb default '[]'::jsonb,
  updated_at   timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════
-- Row Level Security
-- Each user can only ever see and touch their own rows.
-- ═══════════════════════════════════════════════════════════

alter table personal_info      enable row level security;
alter table projects           enable row level security;
alter table job_applications   enable row level security;
alter table cover_letters      enable row level security;
alter table interview_topics   enable row level security;
alter table calendar_events    enable row level security;
alter table content_posts      enable row level security;
alter table app_settings       enable row level security;

-- Policy helper: one policy per table, covers SELECT + INSERT + UPDATE + DELETE
create policy "personal_info: owner only"
  on personal_info for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "projects: owner only"
  on projects for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "job_applications: owner only"
  on job_applications for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cover_letters: owner only"
  on cover_letters for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "interview_topics: owner only"
  on interview_topics for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "calendar_events: owner only"
  on calendar_events for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "content_posts: owner only"
  on content_posts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "app_settings: owner only"
  on app_settings for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
-- Realtime (portfolio sync + kanban live updates)
-- ═══════════════════════════════════════════════════════════
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table job_applications;

-- ═══════════════════════════════════════════════════════════
-- Updated_at auto-trigger
-- ═══════════════════════════════════════════════════════════
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_job_applications_updated_at
  before update on job_applications
  for each row execute function set_updated_at();

create trigger trg_cover_letters_updated_at
  before update on cover_letters
  for each row execute function set_updated_at();

create trigger trg_app_settings_updated_at
  before update on app_settings
  for each row execute function set_updated_at();
