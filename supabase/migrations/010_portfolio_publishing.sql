-- ═══════════════════════════════════════════════════════════
-- Portfolio publishing: HireKit becomes the source of truth for the
-- projects shown on a user's portfolio site.
--
--   project_categories     user-defined categories, in display order
--   projects (+columns)    visibility (pinned / published / hidden),
--                          pin order, category, and the fields a
--                          portfolio card needs
--   portfolio_connections  the feed token a portfolio reads with, and
--                          the deploy hook HireKit calls on changes
-- ═══════════════════════════════════════════════════════════

-- ── Categories ───────────────────────────────────────────────
create table if not exists project_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null check (char_length(name) between 1 and 40),
  sort_order  int  not null default 0,
  created_at  timestamptz default now(),
  unique (user_id, name)
);

alter table project_categories enable row level security;

create policy "project_categories: owner only"
  on project_categories for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Projects ─────────────────────────────────────────────────
alter table projects
  add column if not exists visibility  text not null default 'hidden'
    check (visibility in ('pinned', 'published', 'hidden')),
  add column if not exists pin_order   int,
  add column if not exists category_id uuid references project_categories(id) on delete set null,
  add column if not exists blurb       text,
  add column if not exists docs_url    text,
  add column if not exists year        text,
  -- Where an imported project came from (its live, repo or docs URL), so a
  -- second import recognises it instead of duplicating it.
  add column if not exists source_key  text;

create unique index if not exists projects_user_source_key
  on projects (user_id, source_key) where source_key is not null;

-- Existing rows: featured + published meant "show prominently".
update projects set visibility = case
  when published_to_portfolio and featured then 'pinned'
  when published_to_portfolio             then 'published'
  else 'hidden' end
where visibility = 'hidden';

-- Existing free-text categories become real, renameable categories.
insert into project_categories (user_id, name, sort_order)
select distinct p.user_id, initcap(p.category), 0
from projects p
where p.category is not null and p.category <> ''
on conflict (user_id, name) do nothing;

update projects p set category_id = c.id
from project_categories c
where p.category_id is null
  and c.user_id = p.user_id
  and lower(c.name) = lower(p.category);

-- ── Portfolio connection ─────────────────────────────────────
create table if not exists portfolio_connections (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  site_url            text,
  -- SHA-256 of the feed token. The token itself is shown once, when made;
  -- a lost token is replaced, never recovered.
  feed_token_hash     text unique,
  token_hint          text,
  token_created_at    timestamptz,
  deploy_hook_url     text,
  last_rebuild_at     timestamptz,
  last_rebuild_status text,
  updated_at          timestamptz default now()
);

alter table portfolio_connections enable row level security;

create policy "portfolio_connections: owner only"
  on portfolio_connections for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
