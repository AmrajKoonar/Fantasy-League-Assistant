import * as sleeperApi from './sleeperApi';
import { Messages, UserFacingError } from '../utils/errors';
import { teamNameForRoster } from '../utils/formatting';
import { combineSleeperPoints } from '../utils/sleeperPoints';
import type { SleeperLeagueUser } from '../types/sleeper';

export interface StandingsEntry {
  rank: number;
  rosterId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * Builds league standings by joining rosters with league users.
 * Sorted by wins desc, then points-for desc, then losses asc.
 */
export async function getStandings(leagueId: string): Promise<StandingsEntry[]> {
  const [rosters, users] = await Promise.all([
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);

  if (!rosters || !users) {
    throw new UserFacingError(Messages.genericFailure);
  }

  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));

  const entries = rosters.map((roster) => {
    const settings = roster.settings ?? {};
    return {
      rank: 0,
      rosterId: roster.roster_id,
      teamName: teamNameForRoster(roster, usersById),
      wins: settings.wins ?? 0,
      losses: settings.losses ?? 0,
      ties: settings.ties ?? 0,
      pointsFor: combineSleeperPoints(settings.fpts, settings.fpts_decimal),
      pointsAgainst: combineSleeperPoints(settings.fpts_against, settings.fpts_against_decimal),
    };
  });

  entries.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.losses - b.losses;
  });

  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return entries;
}
