import * as sleeperApi from './sleeperApi';
import { Messages, UserFacingError } from '../utils/errors';
import { teamNameForRoster } from '../utils/formatting';
import type { SleeperLeagueUser, SleeperMatchup } from '../types/sleeper';

export interface MatchupTeam {
  rosterId: number;
  teamName: string;
  points: number;
}

export interface MatchupPairing {
  matchupId: number | null;
  teams: MatchupTeam[];
}

/** Current NFL week from Sleeper's state endpoint (display_week preferred). */
export async function getCurrentNflWeek(): Promise<number> {
  const state = await sleeperApi.getNflState();
  if (!state) throw new UserFacingError(Messages.genericFailure);
  const week = state.display_week ?? state.week;
  // Off-season weeks can come back as 0; default to week 1 for usability.
  return week && week > 0 ? week : 1;
}

/**
 * Fetches a week's matchups and groups them into pairings by matchup_id.
 * Teams with a null matchup_id (bye/median weeks) are returned as
 * single-team pairings so they can be shown gracefully.
 */
export async function getWeekMatchups(leagueId: string, week: number): Promise<MatchupPairing[]> {
  const [matchups, rosters, users] = await Promise.all([
    sleeperApi.getLeagueMatchups(leagueId, week),
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);

  if (!matchups || !rosters || !users) {
    throw new UserFacingError(Messages.genericFailure);
  }

  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));
  const rostersById = new Map(rosters.map((r) => [r.roster_id, r]));

  const toTeam = (m: SleeperMatchup): MatchupTeam => {
    const roster = rostersById.get(m.roster_id);
    return {
      rosterId: m.roster_id,
      teamName: roster ? teamNameForRoster(roster, usersById) : `Roster ${m.roster_id}`,
      points: m.points ?? 0,
    };
  };

  const grouped = new Map<number, MatchupPairing>();
  const unpaired: MatchupPairing[] = [];

  for (const matchup of matchups) {
    if (matchup.matchup_id === null || matchup.matchup_id === undefined) {
      unpaired.push({ matchupId: null, teams: [toTeam(matchup)] });
      continue;
    }
    const existing = grouped.get(matchup.matchup_id);
    if (existing) {
      existing.teams.push(toTeam(matchup));
    } else {
      grouped.set(matchup.matchup_id, {
        matchupId: matchup.matchup_id,
        teams: [toTeam(matchup)],
      });
    }
  }

  const pairings = [...grouped.values()].sort((a, b) => (a.matchupId ?? 0) - (b.matchupId ?? 0));
  return [...pairings, ...unpaired];
}
