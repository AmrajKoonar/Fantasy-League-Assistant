import { supabase } from '../supabaseClient';
import type { InsertTradeOfferInput, TradeOfferRow, TradeOfferStatus } from '../../types/database';
import { logger } from '../../utils/logger';

const TABLE = 'trade_offers';

function throwDbError(context: string, message: string): never {
  logger.error(`${context}: ${message}`);
  throw new Error(`Database error: ${message}`);
}

/** Inserts a new trade offer and returns the created row. */
export async function insertTradeOffer(input: InsertTradeOfferInput): Promise<TradeOfferRow> {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single();
  if (error) throwDbError('Failed to insert trade offer', error.message);
  return data as TradeOfferRow;
}

/** Finds a trade offer by primary key, or null. */
export async function getTradeOfferById(id: string): Promise<TradeOfferRow | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throwDbError(`Failed to fetch trade offer ${id}`, error.message);
  return data as TradeOfferRow | null;
}

/** Updates the Discord message reference after the offer message is sent. */
export async function attachMessage(
  id: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ channel_id: channelId, message_id: messageId })
    .eq('id', id);
  if (error) throwDbError(`Failed to attach message to trade offer ${id}`, error.message);
}

/** Updates a trade offer's status. */
export async function updateStatus(id: string, status: TradeOfferStatus): Promise<TradeOfferRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  if (error) throwDbError(`Failed to update trade offer ${id} status`, error.message);
  return data as TradeOfferRow;
}

/**
 * Lists Discord-only trade offers for a guild, newest first, optionally
 * filtered to offers involving a specific Discord user and/or league.
 */
export async function listTradeOffers(options: {
  guildId: string;
  leagueId?: string;
  discordUserId?: string;
  limit?: number;
}): Promise<TradeOfferRow[]> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .eq('guild_id', options.guildId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 10);

  if (options.leagueId) query = query.eq('league_id', options.leagueId);
  if (options.discordUserId) {
    query = query.or(
      `from_discord_user_id.eq.${options.discordUserId},to_discord_user_id.eq.${options.discordUserId}`,
    );
  }

  const { data, error } = await query;
  if (error)
    throwDbError(`Failed to list trade offers for guild ${options.guildId}`, error.message);
  return (data ?? []) as TradeOfferRow[];
}
