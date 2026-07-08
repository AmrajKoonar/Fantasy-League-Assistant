-- Fantasy League Assistant - Supabase schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard -> SQL Editor)
-- or via the Supabase CLI.

-- ============================================================
-- Table: linked_users
-- One row per Discord user. Maps a Discord account to a Sleeper
-- account globally (not per league, not per guild).
-- ============================================================
create table if not exists public.linked_users (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null unique,
  discord_username text,
  sleeper_user_id text not null,
  sleeper_username text,
  sleeper_display_name text,
  sleeper_avatar text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_linked_users_sleeper_user_id
  on public.linked_users (sleeper_user_id);

-- ============================================================
-- Table: guild_leagues
-- Many rows per Discord server (guild). Each row is one Sleeper
-- league linked to that server, addressable by a normalized
-- nickname (e.g. "division1", "moneyleague").
-- ============================================================
create table if not exists public.guild_leagues (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  guild_name text,
  league_id text not null,
  league_nickname text not null,
  league_name text,
  season text,
  total_rosters integer,
  status text,
  is_default boolean not null default false,
  created_by_discord_user_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint guild_leagues_guild_league_unique unique (guild_id, league_id),
  constraint guild_leagues_guild_nickname_unique unique (guild_id, league_nickname)
);

create index if not exists idx_guild_leagues_guild_id
  on public.guild_leagues (guild_id);

-- Only one default league per guild.
create unique index if not exists idx_guild_leagues_one_default_per_guild
  on public.guild_leagues (guild_id)
  where is_default = true;

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_linked_users_updated_at on public.linked_users;
create trigger trg_linked_users_updated_at
  before update on public.linked_users
  for each row execute function public.set_updated_at();

drop trigger if exists trg_guild_leagues_updated_at on public.guild_leagues;
create trigger trg_guild_leagues_updated_at
  before update on public.guild_leagues
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- The bot uses the service role key, which bypasses RLS.
-- Enabling RLS with no policies blocks access from anon/public
-- keys, which is what we want for a server-side-only schema.
-- ============================================================
alter table public.linked_users enable row level security;
alter table public.guild_leagues enable row level security;
