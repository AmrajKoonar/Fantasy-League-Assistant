/**
 * Shared league-selection logic used by every league-level command,
 * plus the roster auto-detection helper used by /roster.
 */

import * as guildLeaguesRepo from '../db/repositories/guildLeaguesRepository';
import * as linkedUsersRepo from '../db/repositories/linkedUsersRepository';
import * as sleeperApi from './sleeperApi';
import { Messages, UserFacingError } from '../utils/errors';
import { normalizeNickname } from '../utils/formatting';
import type { GuildLeagueRow, LinkedUserRow } from '../types/database';
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

/**
 * Loads the Sleeper link for a Discord user, throwing a friendly error
 * if they (or the targeted user) have not linked an account.
 */
export async function resolveUserLinkedAccount(options: {
  discordUserId: string;
  isSelf: boolean;
  username: string;
}): Promise<LinkedUserRow> {
  const linked = await linkedUsersRepo.getLinkedUser(options.discordUserId);
  if (!linked) {
    throw new UserFacingError(
      options.isSelf ? Messages.notLinked : Messages.targetNotLinked(options.username),
      'No linked account',
    );
  }
  return linked;
}

export interface ResolvedUserLeague {
  guildLeague: GuildLeagueRow;
  linked: LinkedUserRow;
  roster: SleeperRoster;
  isSelf: boolean;
  targetUsername: string;
}

/**
 * Shared resolution for user-specific league commands (/team, /record,
 * /matchup_detail, /luck_rating, /panic_meter). Mirrors /roster:
 *
 * - If a nickname is provided, use that league and require the user in it.
 * - Otherwise auto-detect which linked league contains the user, asking
 *   them to choose when they belong to more than one.
 */
export async function resolveLeagueForUserCommand(options: {
  guildId: string;
  discordUserId: string;
  isSelf: boolean;
  username: string;
  providedLeagueNickname?: string | null;
  /** Command name used when suggesting explicit-league retries. */
  commandName: string;
}): Promise<ResolvedUserLeague> {
  const { guildId, discordUserId, isSelf, username, providedLeagueNickname, commandName } = options;

  const linked = await resolveUserLinkedAccount({ discordUserId, isSelf, username });

  if (providedLeagueNickname) {
    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname,
      allowDefault: false,
    });
    const rosters = await sleeperApi.getLeagueRosters(guildLeague.league_id);
    const roster = rosters?.find(
      (r) =>
        r.owner_id === linked.sleeper_user_id ||
        (r.co_owners ?? [])?.includes(linked.sleeper_user_id),
    );
    if (!roster) {
      throw new UserFacingError(
        `I could not find ${isSelf ? 'your' : `**${username}**'s`} linked Sleeper account in the **${guildLeague.league_nickname}** league.`,
        'Not in this league',
      );
    }
    return { guildLeague, linked, roster, isSelf, targetUsername: username };
  }

  const matches = await findLeaguesContainingSleeperUser({
    guildId,
    sleeperUserId: linked.sleeper_user_id,
  });

  if (matches.length === 0) {
    throw new UserFacingError(
      isSelf
        ? 'I could not find your linked Sleeper account in any league connected to this Discord server. Make sure you linked the correct Sleeper account with `/link_sleeper`.'
        : `I could not find **${username}**'s linked Sleeper account in any league connected to this Discord server.`,
      'No team found',
    );
  }

  if (matches.length > 1) {
    const suggestions = matches
      .map((m) => `\`/${commandName} league:${m.league.league_nickname}\``)
      .join('\n');
    throw new UserFacingError(
      `I found ${isSelf ? 'you' : `**${username}**`} in multiple linked leagues. Please choose one:\n${suggestions}`,
      'Multiple leagues found',
    );
  }

  return {
    guildLeague: matches[0].league,
    linked,
    roster: matches[0].roster,
    isSelf,
    targetUsername: username,
  };
}

export interface SharedLeagueMatch {
  league: GuildLeagueRow;
  rosterA: SleeperRoster;
  rosterB: SleeperRoster;
}

/**
 * Finds the linked leagues where BOTH Sleeper users own a roster.
 * Powers /trade auto-detection of the league two managers share.
 */
export async function findSharedLeaguesBetweenUsers(options: {
  guildId: string;
  sleeperUserIdA: string;
  sleeperUserIdB: string;
}): Promise<SharedLeagueMatch[]> {
  const { guildId, sleeperUserIdA, sleeperUserIdB } = options;
  const leagues = await guildLeaguesRepo.getGuildLeagues(guildId);
  if (leagues.length === 0) {
    throw new UserFacingError(Messages.noLeagues, 'No linked leagues');
  }

  const ownsRoster = (roster: SleeperRoster, userId: string): boolean =>
    roster.owner_id === userId || (roster.co_owners ?? [])?.includes(userId);

  const results = await Promise.all(
    leagues.map(async (league): Promise<SharedLeagueMatch | null> => {
      const rosters = await sleeperApi.getLeagueRosters(league.league_id);
      if (!rosters) return null;
      const rosterA = rosters.find((r) => ownsRoster(r, sleeperUserIdA));
      const rosterB = rosters.find((r) => ownsRoster(r, sleeperUserIdB));
      return rosterA && rosterB ? { league, rosterA, rosterB } : null;
    }),
  );

  return results.filter((r): r is SharedLeagueMatch => r !== null);
}
