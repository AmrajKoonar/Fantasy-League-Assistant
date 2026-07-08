import * as sleeperApi from './sleeperApi';
import * as playerCache from './playerCache';
import { getWeekMatchups, type MatchupPairing } from './matchupService';
import { Messages, UserFacingError } from '../utils/errors';
import { teamNameForRoster } from '../utils/formatting';
import type { SleeperLeagueUser } from '../types/sleeper';

/** Only pairings with two scored teams count toward recap calculations. */
function completedPairings(pairings: MatchupPairing[]): MatchupPairing[] {
  return pairings.filter((p) => p.teams.length === 2);
}

function hasAnyScore(pairings: MatchupPairing[]): boolean {
  return pairings.some((p) => p.teams.some((t) => t.points > 0));
}

export interface WeeklyRecap {
  highest: { teamName: string; points: number } | null;
  lowest: { teamName: string; points: number } | null;
  closest: { teamA: string; teamB: string; margin: number } | null;
  blowout: { winner: string; loser: string; margin: number } | null;
  averageScore: number;
  matchupsDecided: number;
  aboveAverage: string[];
  belowAverage: string[];
  hasScores: boolean;
}

/** Aggregate fun stats for a week. */
export async function getWeeklyRecap(leagueId: string, week: number): Promise<WeeklyRecap> {
  const pairings = await getWeekMatchups(leagueId, week);
  const completed = completedPairings(pairings);
  const hasScores = hasAnyScore(pairings);

  const allTeams = pairings.flatMap((p) => p.teams);
  const average =
    allTeams.length > 0 ? allTeams.reduce((sum, t) => sum + t.points, 0) / allTeams.length : 0;

  let highest: WeeklyRecap['highest'] = null;
  let lowest: WeeklyRecap['lowest'] = null;
  for (const team of allTeams) {
    if (!highest || team.points > highest.points)
      highest = { teamName: team.teamName, points: team.points };
    if (!lowest || team.points < lowest.points)
      lowest = { teamName: team.teamName, points: team.points };
  }

  let closest: WeeklyRecap['closest'] = null;
  let blowout: WeeklyRecap['blowout'] = null;
  for (const pairing of completed) {
    const [a, b] = pairing.teams;
    const margin = Math.abs(a.points - b.points);
    if (!closest || margin < closest.margin) {
      closest = { teamA: a.teamName, teamB: b.teamName, margin };
    }
    if (!blowout || margin > blowout.margin) {
      const winner = a.points >= b.points ? a : b;
      const loser = a.points >= b.points ? b : a;
      blowout = { winner: winner.teamName, loser: loser.teamName, margin };
    }
  }

  return {
    highest,
    lowest,
    closest,
    blowout,
    averageScore: average,
    matchupsDecided: completed.length,
    aboveAverage: allTeams.filter((t) => t.points > average).map((t) => t.teamName),
    belowAverage: allTeams.filter((t) => t.points < average).map((t) => t.teamName),
    hasScores,
  };
}

export interface BlowoutResult {
  winner: string;
  loser: string;
  winnerPoints: number;
  loserPoints: number;
  margin: number;
}

/** Largest margin matchup of the week, or null if none completed. */
export async function getBiggestBlowout(
  leagueId: string,
  week: number,
): Promise<BlowoutResult | null> {
  const pairings = completedPairings(await getWeekMatchups(leagueId, week));
  let best: BlowoutResult | null = null;
  for (const pairing of pairings) {
    const [a, b] = pairing.teams;
    const margin = Math.abs(a.points - b.points);
    if (!best || margin > best.margin) {
      const winner = a.points >= b.points ? a : b;
      const loser = a.points >= b.points ? b : a;
      best = {
        winner: winner.teamName,
        loser: loser.teamName,
        winnerPoints: winner.points,
        loserPoints: loser.points,
        margin,
      };
    }
  }
  return best;
}

export interface ClosestResult {
  teamA: string;
  teamB: string;
  pointsA: number;
  pointsB: number;
  margin: number;
}

/** Smallest margin matchup of the week, or null if none completed. */
export async function getClosestMatchup(
  leagueId: string,
  week: number,
): Promise<ClosestResult | null> {
  const pairings = completedPairings(await getWeekMatchups(leagueId, week));
  let best: ClosestResult | null = null;
  for (const pairing of pairings) {
    const [a, b] = pairing.teams;
    const margin = Math.abs(a.points - b.points);
    if (!best || margin < best.margin) {
      best = { teamA: a.teamName, teamB: b.teamName, pointsA: a.points, pointsB: b.points, margin };
    }
  }
  return best;
}

export interface BenchwarmerResult {
  teamName: string;
  benchPoints: number;
  topBenchPlayer: string | null;
  topBenchPoints: number;
}

/**
 * Highest bench score of the week, when Sleeper returns per-player points.
 * Returns null when the matchup payload lacks players_points (e.g. the
 * week has not started), so the command can show a graceful message.
 */
export async function getBenchwarmer(
  leagueId: string,
  week: number,
): Promise<BenchwarmerResult | null> {
  const [matchups, rosters, users] = await Promise.all([
    sleeperApi.getLeagueMatchups(leagueId, week),
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!matchups || !rosters || !users) throw new UserFacingError(Messages.genericFailure);

  const hasPlayerPoints = matchups.some(
    (m) => m.players_points && Object.keys(m.players_points).length > 0,
  );
  if (!hasPlayerPoints) return null;

  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));
  const rostersById = new Map(rosters.map((r) => [r.roster_id, r]));
  const players = await playerCache.getAllPlayers();

  let best: BenchwarmerResult | null = null;

  for (const matchup of matchups) {
    const playerPoints = matchup.players_points;
    if (!playerPoints) continue;

    const starters = new Set((matchup.starters ?? []).filter((id) => id && id !== '0'));
    const benchIds = (matchup.players ?? []).filter((id) => !starters.has(id));

    let benchTotal = 0;
    let topPlayerId: string | null = null;
    let topPoints = 0;
    for (const id of benchIds) {
      const pts = playerPoints[id] ?? 0;
      benchTotal += pts;
      if (pts > topPoints) {
        topPoints = pts;
        topPlayerId = id;
      }
    }

    if (!best || benchTotal > best.benchPoints) {
      const roster = rostersById.get(matchup.roster_id);
      best = {
        teamName: roster ? teamNameForRoster(roster, usersById) : `Roster ${matchup.roster_id}`,
        benchPoints: benchTotal,
        topBenchPlayer: topPlayerId
          ? playerCache.formatPlayerName(players[topPlayerId], topPlayerId)
          : null,
        topBenchPoints: topPoints,
      };
    }
  }

  return best;
}
