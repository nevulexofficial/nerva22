-- NERV4 — shared world schema (Supabase / PostgreSQL)
-- Run in the Supabase SQL editor, or `supabase db push`.
--
-- Design: every player shares ONE universe. Each signed-in manager publishes
-- their club snapshot to `world_players`; notable happenings and admin
-- broadcasts land in `world_feed`. Reads are public (anon), writes go through
-- the Bun backend with the service-role key (RLS bypass).

-- ── Player club snapshots (one row per manager) ─────────────────────────────
create table if not exists world_players (
  user_id     text primary key,
  email       text,
  club_id     text,
  club_name   text not null,
  league_slug text,
  league_name text,
  budget      bigint,
  current_date text,
  reputation  integer default 0,
  updated_at  timestamptz not null default now()
);

-- ── Shared activity feed (match events, transfers, broadcasts) ──────────────
create table if not exists world_feed (
  id          bigint generated always as identity primary key,
  kind        text not null default 'event',   -- event | broadcast | milestone
  title       text not null,
  body        text,
  league_slug text,
  club_name   text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_world_feed_created on world_feed (created_at desc);
create index if not exists idx_world_players_updated on world_players (updated_at desc);

-- ── RLS: public read, no client writes (backend uses service role) ─────────
alter table world_players enable row level security;
alter table world_feed    enable row level security;

create policy "public read world_players"
  on world_players for select
  using (true);

create policy "public read world_feed"
  on world_feed for select
  using (true);
