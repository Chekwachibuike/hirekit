create table if not exists calendar_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade not null,
  title          text not null,
  type           text not null check (type in ('interview','deadline','study','follow_up','other')),
  date           date not null,
  time           time,
  application_id uuid,
  notes          text,
  created_at     timestamptz default now()
);

alter table calendar_events enable row level security;

drop policy if exists "calendar_events: owner only" on calendar_events;
create policy "calendar_events: owner only" on calendar_events
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists calendar_events_user_date on calendar_events (user_id, date);
