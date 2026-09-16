-- CV version history — lets users keep multiple uploaded CVs
create table if not exists cv_versions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  label       text not null,
  cv_markdown text,
  created_at  timestamptz default now()
);

alter table cv_versions enable row level security;

create policy "cv_versions: owner only"
  on cv_versions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
