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

/** Parsed representation of one side of a trade offer. */
export interface ParsedTradeAssets {
  /** Sleeper player IDs that were successfully matched. */
  playerIds: string[];
  /** Human-readable player names (matched or raw). */
  playerNames: string[];
  /** FAAB dollars included on this side, if any. */
  faab: number | null;
  /** Raw tokens that could not be matched to a player. */
  unmatched: string[];
}

export type TradeOfferStatus =
  'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'cancelled';

export interface TradeOfferRow {
  id: string;
  guild_id: string;
  channel_id: string | null;
  message_id: string | null;
  league_id: string;
  league_nickname: string;
  from_discord_user_id: string;
  to_discord_user_id: string;
  from_sleeper_user_id: string;
  to_sleeper_user_id: string;
  from_roster_id: number | null;
  to_roster_id: number | null;
  send_text: string;
  receive_text: string;
  parsed_send: ParsedTradeAssets | null;
  parsed_receive: ParsedTradeAssets | null;
  status: TradeOfferStatus;
  note: string | null;
  parent_trade_offer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsertTradeOfferInput {
  guild_id: string;
  channel_id: string | null;
  message_id: string | null;
  league_id: string;
  league_nickname: string;
  from_discord_user_id: string;
  to_discord_user_id: string;
  from_sleeper_user_id: string;
  to_sleeper_user_id: string;
  from_roster_id: number | null;
  to_roster_id: number | null;
  send_text: string;
  receive_text: string;
  parsed_send: ParsedTradeAssets | null;
  parsed_receive: ParsedTradeAssets | null;
  status: TradeOfferStatus;
  note: string | null;
  parent_trade_offer_id: string | null;
}
