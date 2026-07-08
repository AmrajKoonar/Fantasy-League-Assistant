/**
 * Types for the official Sleeper API (https://docs.sleeper.com/).
 * Only the fields the bot actually uses are typed strictly; everything
 * else is left optional since Sleeper responses vary by league type.
 */

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status?: string;
  sport?: string;
  total_rosters?: number;
  roster_positions?: string[];
  scoring_settings?: Record<string, number>;
  settings?: Record<string, number>;
  draft_id?: string | null;
  avatar?: string | null;
  previous_league_id?: string | null;
}

export interface SleeperRosterSettings {
  wins?: number;
  losses?: number;
  ties?: number;
  fpts?: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  waiver_budget_used?: number;
  [key: string]: number | undefined;
}

export interface SleeperRoster {
  roster_id: number;
  league_id?: string;
  owner_id: string | null;
  co_owners?: string[] | null;
  players: string[] | null;
  starters: string[] | null;
  reserve?: string[] | null;
  taxi?: string[] | null;
  settings?: SleeperRosterSettings;
}

export interface SleeperLeagueUser {
  user_id: string;
  username?: string;
  display_name: string;
  avatar?: string | null;
  is_owner?: boolean;
  metadata?: {
    team_name?: string;
    [key: string]: unknown;
  };
}

export interface SleeperMatchup {
  matchup_id: number | null;
  roster_id: number;
  points: number | null;
  starters?: string[] | null;
  players?: string[] | null;
  starters_points?: number[] | null;
  players_points?: Record<string, number> | null;
}

export interface SleeperNflState {
  week: number;
  display_week?: number;
  season: string;
  season_type: string;
  league_season?: string;
  previous_season?: string;
}

export type SleeperTransactionType = 'trade' | 'waiver' | 'free_agent' | 'commissioner' | string;

export interface SleeperTransaction {
  transaction_id: string;
  type: SleeperTransactionType;
  status: string;
  roster_ids: number[] | null;
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks?: unknown[] | null;
  waiver_budget?: { sender: number; receiver: number; amount: number }[] | null;
  settings?: { waiver_bid?: number; seq?: number } | null;
  created: number;
  status_updated?: number;
  creator?: string;
  consenter_ids?: number[] | null;
}

export interface SleeperPlayer {
  player_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  age?: number | null;
  status?: string | null;
  injury_status?: string | null;
  number?: number | null;
  years_exp?: number | null;
  search_full_name?: string;
  search_first_name?: string;
  search_last_name?: string;
}

export type SleeperPlayersMap = Record<string, SleeperPlayer>;

export interface SleeperTrendingPlayer {
  player_id: string;
  count: number;
}

export type TrendingType = 'add' | 'drop';
