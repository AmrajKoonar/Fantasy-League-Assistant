/** Row types for the Supabase tables defined in supabase/schema.sql. */

export interface LinkedUserRow {
  id: string;
  discord_user_id: string;
  discord_username: string | null;
  sleeper_user_id: string;
  sleeper_username: string | null;
  sleeper_display_name: string | null;
  sleeper_avatar: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuildLeagueRow {
  id: string;
  guild_id: string;
  guild_name: string | null;
  league_id: string;
  league_nickname: string;
  league_name: string | null;
  season: string | null;
  total_rosters: number | null;
  status: string | null;
  is_default: boolean;
  created_by_discord_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertLinkedUserInput {
  discord_user_id: string;
  discord_username: string | null;
  sleeper_user_id: string;
  sleeper_username: string | null;
  sleeper_display_name: string | null;
  sleeper_avatar: string | null;
}

export interface UpsertGuildLeagueInput {
  guild_id: string;
  guild_name: string | null;
  league_id: string;
  league_nickname: string;
  league_name: string | null;
  season: string | null;
  total_rosters: number | null;
  status: string | null;
  is_default: boolean;
  created_by_discord_user_id: string | null;
}
