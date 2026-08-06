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
-- Table: trade_offers
-- Discord-only trade proposals created with /trade. These are NOT
-- submitted to Sleeper (the Sleeper API is read-only) — they are a
-- social layer for members to agree on a deal before doing it manually
-- in Sleeper.
-- ============================================================
create table if not exists public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  channel_id text,
  message_id text,
  league_id text not null,
  league_nickname text not null,
  from_discord_user_id text not null,
  to_discord_user_id text not null,
  from_sleeper_user_id text not null,
  to_sleeper_user_id text not null,
  from_roster_id integer,
  to_roster_id integer,
  send_text text not null,
  receive_text text not null,
  parsed_send jsonb,
  parsed_receive jsonb,
  status text not null default 'pending',
  note text,
  parent_trade_offer_id uuid references public.trade_offers(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_trade_offers_guild_id on public.trade_offers(guild_id);
create index if not exists idx_trade_offers_league_id on public.trade_offers(league_id);
create index if not exists idx_trade_offers_from_user on public.trade_offers(from_discord_user_id);
create index if not exists idx_trade_offers_to_user on public.trade_offers(to_discord_user_id);
create index if not exists idx_trade_offers_status on public.trade_offers(status);
create index if not exists idx_trade_offers_created_at on public.trade_offers(created_at);

-- ============================================================
-- Table: draft_grades
-- Immutable history of league-wide AI-assisted draft analyses. The
-- latest row for a guild/league powers /draft_grade.
-- ============================================================
create table if not exists public.draft_grades (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  league_id text not null,
  league_nickname text not null,
  league_name text,
  season text,
  generated_by_discord_user_id text not null,
  model_provider text not null,
  model_name text not null,
  ranking_source text not null default 'fantasypros',
  ranking_type text,
  input_hash text not null,
  result jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_draft_grades_guild_league
  on public.draft_grades(guild_id, league_id);
create index if not exists idx_draft_grades_created_at
  on public.draft_grades(created_at desc);

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

drop trigger if exists trg_trade_offers_updated_at on public.trade_offers;
create trigger trg_trade_offers_updated_at
  before update on public.trade_offers
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- The bot uses the service role key, which bypasses RLS.
-- Enabling RLS with no policies blocks access from anon/public
-- keys, which is what we want for a server-side-only schema.
-- ============================================================
alter table public.linked_users enable row level security;
alter table public.guild_leagues enable row level security;
alter table public.trade_offers enable row level security;
alter table public.draft_grades enable row level security;
