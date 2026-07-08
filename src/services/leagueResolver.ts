/**
 * Shared league-selection logic used by every league-level command,
 * plus the roster auto-detection helper used by /roster.
 */

import * as guildLeaguesRepo from '../db/repositories/guildLeaguesRepository';
import * as sleeperApi from './sleeperApi';
import { Messages, UserFacingError } from '../utils/errors';
import { normalizeNickname } from '../utils/formatting';
import type { GuildLeagueRow } from '../types/database';
import type { SleeperRoster } from '../types/sleeper';

export interface ResolveLeagueOptions {
  guildId: string;
  providedLeagueNickname?: string | null;
  /** When true (default), fall back to the guild's default league. */
  allowDefault?: boolean;
}

/**
 * Resolves which linked league a command should operate on.
 *
 * 1. If a nickname was provided, use that league (error if not found).
 * 2. Otherwise use the guild's default league if one exists.
 * 3. Otherwise, if exactly one league is linked, use it.
 * 4. Otherwise ask the user to choose (multiple leagues, no default).
 * 5. If the guild has no leagues at all, tell the owner to add one.
 */
export async function resolveLeagueForCommand(
  options: ResolveLeagueOptions,
): Promise<GuildLeagueRow> {
  const { guildId, providedLeagueNickname, allowDefault = true } = options;

  if (providedLeagueNickname) {
    const normalized = normalizeNickname(providedLeagueNickname);
    const league = await guildLeaguesRepo.getGuildLeagueByNickname(guildId, normalized);
    if (!league) {
      throw new UserFacingError(
        `${Messages.leagueNotFound}\nUse \`/leagues\` to see the leagues linked to this server.`,
        'League not found',
      );
    }
    return league;
  }

  const leagues = await guildLeaguesRepo.getGuildLeagues(guildId);
  if (leagues.length === 0) {
    throw new UserFacingError(Messages.noLeagues, 'No linked leagues');
  }

  if (allowDefault) {
    const defaultLeague = leagues.find((l) => l.is_default);
    if (defaultLeague) return defaultLeague;
  }

  if (leagues.length === 1) return leagues[0];

  const choices = leagues.map((l) => `\`${l.league_nickname}\``).join(', ');
  throw new UserFacingError(
    `This server has multiple linked leagues and no default. Please choose one with the \`league\` option: ${choices}`,
    'Choose a league',
  );
}

export interface LeagueRosterMatch {
  league: GuildLeagueRow;
  roster: SleeperRoster;
}

/**
 * Finds which of the guild's linked leagues contain a roster owned by
 * (or co-owned by) the given Sleeper user. Uses cached rosters so it
 * does not hammer the Sleeper API. Powers /roster auto-detection.
 */
export async function findLeaguesContainingSleeperUser(options: {
  guildId: string;
  sleeperUserId: string;
}): Promise<LeagueRosterMatch[]> {
  const { guildId, sleeperUserId } = options;
  const leagues = await guildLeaguesRepo.getGuildLeagues(guildId);
  if (leagues.length === 0) {
    throw new UserFacingError(Messages.noLeagues, 'No linked leagues');
  }

  const results = await Promise.all(
    leagues.map(async (league): Promise<LeagueRosterMatch | null> => {
      const rosters = await sleeperApi.getLeagueRosters(league.league_id);
      if (!rosters) return null;
      const roster = rosters.find(
        (r) => r.owner_id === sleeperUserId || (r.co_owners ?? [])?.includes(sleeperUserId),
      );
      return roster ? { league, roster } : null;
    }),
  );

  return results.filter((r): r is LeagueRosterMatch => r !== null);
}
