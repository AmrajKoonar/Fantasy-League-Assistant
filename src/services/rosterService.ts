import * as sleeperApi from './sleeperApi';
import * as playerCache from './playerCache';
import { Messages, UserFacingError } from '../utils/errors';
import { formatPlayerLine, teamNameForRoster } from '../utils/formatting';
import type { SleeperLeagueUser, SleeperRoster } from '../types/sleeper';

export interface RosterView {
  teamName: string;
  record: { wins: number; losses: number; ties: number };
  starters: string[];
  bench: string[];
  reserve: string[];
  taxi: string[];
}

/**
 * Builds a display-ready view of a roster: starters, bench (players
 * minus starters), IR, and taxi, with player IDs resolved to names
 * via the 24h player cache.
 */
export async function buildRosterView(
  leagueId: string,
  roster: SleeperRoster,
): Promise<RosterView> {
  const users = await sleeperApi.getLeagueUsers(leagueId);
  if (!users) throw new UserFacingError(Messages.genericFailure);
  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));

  const players = await playerCache.getAllPlayers();
  const line = (playerId: string): string => formatPlayerLine(players[playerId], playerId);
  const reserveLine = (playerId: string): string => {
    const formatted = line(playerId);
    return formatted.includes('🔴') ? formatted : `🔴 ${formatted}`;
  };

  const starterIds = (roster.starters ?? []).filter((id) => id && id !== '0');
  const allIds = roster.players ?? [];
  const starterSet = new Set(starterIds);
  const benchIds = allIds.filter((id) => !starterSet.has(id));
  const reserveIds = roster.reserve ?? [];
  const taxiIds = roster.taxi ?? [];

  const settings = roster.settings ?? {};

  return {
    teamName: teamNameForRoster(roster, usersById),
    record: {
      wins: settings.wins ?? 0,
      losses: settings.losses ?? 0,
      ties: settings.ties ?? 0,
    },
    starters: starterIds.map(line),
    bench: benchIds.map(line),
    reserve: reserveIds.map(reserveLine),
    taxi: taxiIds.map(line),
  };
}

/** Maps every roster_id in a league to a display-ready team name. */
export async function getTeamNamesByRosterId(leagueId: string): Promise<Map<number, string>> {
  const [rosters, users] = await Promise.all([
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!rosters || !users) throw new UserFacingError(Messages.genericFailure);
  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));
  return new Map(rosters.map((r) => [r.roster_id, teamNameForRoster(r, usersById)]));
}

/** Finds the roster owned (or co-owned) by a Sleeper user in a league, or null. */
export async function findRosterForSleeperUser(
  leagueId: string,
  sleeperUserId: string,
): Promise<SleeperRoster | null> {
  const rosters = await sleeperApi.getLeagueRosters(leagueId);
  if (!rosters) throw new UserFacingError(Messages.genericFailure);
  return (
    rosters.find(
      (r) => r.owner_id === sleeperUserId || (r.co_owners ?? [])?.includes(sleeperUserId),
    ) ?? null
  );
}
