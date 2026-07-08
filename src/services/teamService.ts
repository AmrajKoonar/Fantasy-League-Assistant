import * as sleeperApi from './sleeperApi';
import { Messages, UserFacingError } from '../utils/errors';
import { teamNameForRoster } from '../utils/formatting';
import { combineSleeperPoints } from '../utils/sleeperPoints';
import type { SleeperLeagueUser, SleeperRoster } from '../types/sleeper';

/**
 * A rich, display-ready snapshot of one team, combining roster settings,
 * league-user info, and league-wide ranks. Shared by /team, /record,
 * /power_rankings, /league_records, /moves, /luck_rating, /panic_meter.
 */
export interface TeamStat {
  rosterId: number;
  ownerId: string | null;
  teamName: string;
  managerName: string;
  sleeperUsername: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  waiverPosition: number | null;
  faabUsed: number | null;
  totalMoves: number;
  playersCount: number;
  startersCount: number;
  benchCount: number;
  irCount: number;
  taxiCount: number;
  /** 1-based standings rank (wins, then PF, then losses). */
  standingsRank: number;
  /** 1-based rank by points for (highest = 1). */
  pointsForRank: number;
}

function countStarters(roster: SleeperRoster): number {
  return (roster.starters ?? []).filter((id) => id && id !== '0').length;
}

/**
 * Builds TeamStat entries for every roster in a league, with standings
 * and points-for ranks pre-computed.
 */
export async function getTeamStats(leagueId: string): Promise<TeamStat[]> {
  const [rosters, users] = await Promise.all([
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!rosters || !users) throw new UserFacingError(Messages.genericFailure);

  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));

  const stats: TeamStat[] = rosters.map((roster) => {
    const settings = roster.settings ?? {};
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const pointsFor = combineSleeperPoints(settings.fpts, settings.fpts_decimal);
    const pointsAgainst = combineSleeperPoints(
      settings.fpts_against,
      settings.fpts_against_decimal,
    );
    const starters = countStarters(roster);
    const playersCount = (roster.players ?? []).length;
    const reserveCount = (roster.reserve ?? []).length;
    const taxiCount = (roster.taxi ?? []).length;

    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      teamName: teamNameForRoster(roster, usersById),
      managerName: owner?.display_name ?? owner?.username ?? 'Unknown Manager',
      sleeperUsername: owner?.username ?? null,
      wins: settings.wins ?? 0,
      losses: settings.losses ?? 0,
      ties: settings.ties ?? 0,
      pointsFor,
      pointsAgainst,
      pointDiff: pointsFor - pointsAgainst,
      waiverPosition: settings.waiver_position ?? null,
      faabUsed: settings.waiver_budget_used ?? null,
      totalMoves: settings.total_moves ?? 0,
      playersCount,
      startersCount: starters,
      benchCount: Math.max(playersCount - starters, 0),
      irCount: reserveCount,
      taxiCount,
      standingsRank: 0,
      pointsForRank: 0,
    };
  });

  const byStandings = [...stats].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.losses - b.losses;
  });
  byStandings.forEach((s, i) => {
    s.standingsRank = i + 1;
  });

  const byPoints = [...stats].sort((a, b) => b.pointsFor - a.pointsFor);
  byPoints.forEach((s, i) => {
    s.pointsForRank = i + 1;
  });

  return stats;
}

/** Finds the TeamStat owned by a Sleeper user, or undefined. */
export function findTeamStat(stats: TeamStat[], sleeperUserId: string): TeamStat | undefined {
  return stats.find((s) => s.ownerId === sleeperUserId);
}

/** Finds a TeamStat by roster ID, or undefined. */
export function findTeamStatByRosterId(stats: TeamStat[], rosterId: number): TeamStat | undefined {
  return stats.find((s) => s.rosterId === rosterId);
}
