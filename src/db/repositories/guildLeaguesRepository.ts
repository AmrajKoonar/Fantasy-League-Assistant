import { supabase } from '../supabaseClient';
import type { GuildLeagueRow, UpsertGuildLeagueInput } from '../../types/database';
import { logger } from '../../utils/logger';

const TABLE = 'guild_leagues';

function throwDbError(context: string, message: string): never {
  logger.error(`${context}: ${message}`);
  throw new Error(`Database error: ${message}`);
}

/** All leagues linked to a guild, default league first, then by nickname. */
export async function getGuildLeagues(guildId: string): Promise<GuildLeagueRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('guild_id', guildId)
    .order('is_default', { ascending: false })
    .order('league_nickname', { ascending: true });

  if (error) throwDbError(`Failed to fetch leagues for guild ${guildId}`, error.message);
  return (data ?? []) as GuildLeagueRow[];
}

/** Finds a guild league by normalized nickname, or null. */
export async function getGuildLeagueByNickname(
  guildId: string,
  normalizedNickname: string,
): Promise<GuildLeagueRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('guild_id', guildId)
    .eq('league_nickname', normalizedNickname)
    .maybeSingle();

  if (error) throwDbError(`Failed to fetch league ${normalizedNickname}`, error.message);
  return data as GuildLeagueRow | null;
}

/** Finds a guild league by Sleeper league ID, or null. */
export async function getGuildLeagueByLeagueId(
  guildId: string,
  leagueId: string,
): Promise<GuildLeagueRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('guild_id', guildId)
    .eq('league_id', leagueId)
    .maybeSingle();

  if (error) throwDbError(`Failed to fetch league ${leagueId}`, error.message);
  return data as GuildLeagueRow | null;
}

/** Inserts a new guild league row. */
export async function insertGuildLeague(input: UpsertGuildLeagueInput): Promise<GuildLeagueRow> {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single();
  if (error) throwDbError(`Failed to insert league ${input.league_id}`, error.message);
  return data as GuildLeagueRow;
}

/** Updates an existing guild league row by primary key. */
export async function updateGuildLeague(
  id: string,
  patch: Partial<UpsertGuildLeagueInput>,
): Promise<GuildLeagueRow> {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throwDbError(`Failed to update league row ${id}`, error.message);
  return data as GuildLeagueRow;
}

/** Deletes a guild league row by primary key. */
export async function deleteGuildLeague(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throwDbError(`Failed to delete league row ${id}`, error.message);
}

/**
 * Makes the given league the guild's default, clearing the flag on all
 * other leagues first (the partial unique index allows only one default).
 */
export async function setDefaultLeague(guildId: string, leagueRowId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from(TABLE)
    .update({ is_default: false })
    .eq('guild_id', guildId)
    .eq('is_default', true)
    .neq('id', leagueRowId);
  if (clearError) throwDbError(`Failed to clear defaults for guild ${guildId}`, clearError.message);

  const { error: setError } = await supabase
    .from(TABLE)
    .update({ is_default: true })
    .eq('id', leagueRowId);
  if (setError) throwDbError(`Failed to set default league ${leagueRowId}`, setError.message);
}
