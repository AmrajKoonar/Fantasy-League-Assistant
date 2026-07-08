import { getTeamStats, type TeamStat } from './teamService';

export interface PowerRankingEntry {
  rank: number;
  teamName: string;
  managerName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointDiff: number;
  powerScore: number;
}

/** The V1 power-ranking formula. Kept explicit so it can be shown to users. */
export const POWER_FORMULA = 'wins × 10 + pointsFor × 0.01 + pointDifferential × 0.005';

function powerScore(stat: TeamStat): number {
  return stat.wins * 10 + stat.pointsFor * 0.01 + stat.pointDiff * 0.005;
}

/**
 * Bot-calculated power rankings (NOT official Sleeper data). Sorted by a
 * simple, explainable formula.
 */
export async function getPowerRankings(leagueId: string): Promise<PowerRankingEntry[]> {
  const stats = await getTeamStats(leagueId);
  return stats
    .map((s) => ({
      rank: 0,
      teamName: s.teamName,
      managerName: s.managerName,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pointsFor: s.pointsFor,
      pointDiff: s.pointDiff,
      powerScore: powerScore(s),
    }))
    .sort((a, b) => b.powerScore - a.powerScore)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export interface LeagueRecord {
  label: string;
  teamName: string;
  value: string;
}

/** Picks the team maximizing (or minimizing) a numeric selector. */
function extreme(
  stats: TeamStat[],
  selector: (s: TeamStat) => number,
  direction: 'max' | 'min',
): TeamStat | undefined {
  if (stats.length === 0) return undefined;
  return stats.reduce((best, current) => {
    const b = selector(best);
    const c = selector(current);
    if (direction === 'max') return c > b ? current : best;
    return c < b ? current : best;
  });
}

/** Fun league-wide records and extremes. */
export async function getLeagueRecords(leagueId: string): Promise<LeagueRecord[]> {
  const stats = await getTeamStats(leagueId);
  if (stats.length === 0) return [];

  const records: LeagueRecord[] = [];
  const add = (label: string, stat: TeamStat | undefined, value: (s: TeamStat) => string): void => {
    if (stat) records.push({ label, teamName: stat.teamName, value: value(stat) });
  };

  add(
    '🏆 Most wins',
    extreme(stats, (s) => s.wins, 'max'),
    (s) => `${s.wins} wins`,
  );
  add(
    '💀 Most losses',
    extreme(stats, (s) => s.losses, 'max'),
    (s) => `${s.losses} losses`,
  );
  add(
    '🔥 Most points for',
    extreme(stats, (s) => s.pointsFor, 'max'),
    (s) => s.pointsFor.toFixed(2),
  );
  add(
    '🛡️ Most points against',
    extreme(stats, (s) => s.pointsAgainst, 'max'),
    (s) => s.pointsAgainst.toFixed(2),
  );
  add(
    '📈 Best point differential',
    extreme(stats, (s) => s.pointDiff, 'max'),
    (s) => `${s.pointDiff >= 0 ? '+' : ''}${s.pointDiff.toFixed(2)}`,
  );
  add(
    '📉 Worst point differential',
    extreme(stats, (s) => s.pointDiff, 'min'),
    (s) => `${s.pointDiff >= 0 ? '+' : ''}${s.pointDiff.toFixed(2)}`,
  );
  add(
    '🔄 Most moves',
    extreme(stats, (s) => s.totalMoves, 'max'),
    (s) => `${s.totalMoves} moves`,
  );

  // "Most chaotic": high points against + lots of moves.
  const chaotic = extreme(stats, (s) => s.pointsAgainst + s.totalMoves * 5, 'max');
  add('🌪️ Most chaotic', chaotic, (s) => `${s.pointsAgainst.toFixed(0)} PA, ${s.totalMoves} moves`);

  return records;
}
