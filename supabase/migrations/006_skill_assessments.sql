-- Skill self-assessment (inspired by HowProgrammingWorks/SelfAssessment).
-- One row per user; levels is a JSONB map of skillId -> level (1-4):
--   1 = heard of it, 2 = know it, 3 = used it, 4 = can teach it
-- Unset skills are simply absent from the map.
create table if not exists skill_assessments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null unique,
  levels     jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table skill_assessments enable row level security;

create policy "skill_assessments: owner only"
  on skill_assessments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger trg_skill_assessments_updated_at
  before update on skill_assessments
  for each row execute function set_updated_at();
