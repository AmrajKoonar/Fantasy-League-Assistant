import type { SleeperLeague } from '../types/sleeper';
import type { FantasyProsScoring } from '../types/fantasyPros';
import type {
  DraftGradeMetrics,
  DraftGradeTeamProfile,
  DraftGradePlayer,
  PositionDepth,
} from '../types/draftGrades';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function playerRank(player: DraftGradePlayer): number | null {
  return player.fantasyprosOverallRank ?? player.fantasyprosAdp;
}

export function detectFantasyProsScoring(league: SleeperLeague): FantasyProsScoring {
  const receptionPoints = league.scoring_settings?.rec ?? 0;
  if (receptionPoints >= 0.75) return 'PPR';
  if (receptionPoints >= 0.25) return 'HALF';
  return 'STD';
}

function slotCounts(rosterPositions: string[]): Record<string, number> {
  return rosterPositions.reduce<Record<string, number>>((counts, slot) => {
    counts[slot] = (counts[slot] ?? 0) + 1;
    return counts;
  }, {});
}

function buildPositionDepth(profile: DraftGradeTeamProfile): PositionDepth {
  const depth: PositionDepth = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0, IR: 0, TAXI: 0 };
  for (const player of profile.players) {
    const position = player.position === 'DST' ? 'DEF' : player.position;
    if (position in depth && position !== 'IR' && position !== 'TAXI') {
      depth[position as keyof PositionDepth] += 1;
    }
    if (player.isReserve) depth.IR += 1;
    if (player.isTaxi) depth.TAXI += 1;
  }
  return depth;
}

function balanceScore(depth: PositionDepth, slots: Record<string, number>): number {
  const neededQb = (slots.QB ?? 0) + (slots.SUPER_FLEX ?? 0) + (slots.SUPERFLEX ?? 0);
  const neededRb = (slots.RB ?? 0) + Math.ceil((slots.FLEX ?? 0) / 2);
  const neededWr = (slots.WR ?? 0) + Math.floor((slots.FLEX ?? 0) / 2);
  const neededTe = slots.TE ?? 0;
  const coverage = [
    clamp(depth.QB / Math.max(1, neededQb + 1), 0, 1),
    clamp(depth.RB / Math.max(2, neededRb + 2), 0, 1),
    clamp(depth.WR / Math.max(2, neededWr + 2), 0, 1),
    clamp(depth.TE / Math.max(1, neededTe + 1), 0, 1),
  ];
  return rounded((coverage.reduce((sum, value) => sum + value, 0) / coverage.length) * 100);
}

function scarcityScore(
  profile: DraftGradeTeamProfile,
  league: SleeperLeague,
  scoring: FantasyProsScoring,
): number {
  const slots = slotCounts(league.roster_positions ?? []);
  const superflex = (slots.SUPER_FLEX ?? 0) + (slots.SUPERFLEX ?? 0) + (slots.QB ?? 0) > 1;
  const tePremium = (league.scoring_settings?.bonus_rec_te ?? 0) > 0;
  let score = 50;
  for (const player of profile.players.filter((candidate) => candidate.isStarter)) {
    const rank = playerRank(player);
    if (rank === null) continue;
    if (player.position === 'QB' && superflex) score += clamp((80 - rank) / 8, 0, 10);
    if (player.position === 'TE' && tePremium) score += clamp((100 - rank) / 10, 0, 8);
    if (['RB', 'WR'].includes(player.position) && scoring !== 'STD') {
      score += clamp((60 - rank) / 15, 0, 4);
    }
  }
  return rounded(clamp(score, 0, 100));
}

function scoringFitScore(
  profile: DraftGradeTeamProfile,
  league: SleeperLeague,
  scoring: FantasyProsScoring,
): number {
  const positions = league.roster_positions ?? [];
  const flexCount = positions.filter((slot) => slot.includes('FLEX')).length;
  const benchCount = positions.filter((slot) => slot === 'BN').length;
  const rankedDepth = profile.players.filter((player) => playerRank(player) !== null).length;
  const skillDepth = profile.players.filter((player) =>
    ['RB', 'WR', 'TE'].includes(player.position),
  ).length;
  let score = 55 + Math.min(20, rankedDepth * 1.5);
  if (flexCount > 0) score += Math.min(10, skillDepth - flexCount * 2);
  if (benchCount >= 6) score += Math.min(10, Math.max(0, rankedDepth - 8));
  if (scoring === 'PPR') {
    score += Math.min(5, profile.players.filter((player) => player.position === 'WR').length);
  }
  return rounded(clamp(score, 0, 100));
}

export function calculateDraftGradeMetrics(
  profile: DraftGradeTeamProfile,
  league: SleeperLeague,
  scoring: FantasyProsScoring,
): DraftGradeMetrics {
  const starters = profile.players.filter((player) => player.isStarter);
  const bench = profile.players.filter(
    (player) => !player.isStarter && !player.isReserve && !player.isTaxi,
  );
  const starterRanks = starters.map(playerRank).filter((rank): rank is number => rank !== null);
  const benchRanks = bench.map(playerRank).filter((rank): rank is number => rank !== null);
  const allRanks = profile.players.map(playerRank).filter((rank): rank is number => rank !== null);
  const averageStarterRank = average(starterRanks);
  const averageBenchRank = average(benchRanks);
  const depth = buildPositionDepth(profile);
  const slots = slotCounts(league.roster_positions ?? []);
  const rosterBalanceScore = balanceScore(depth, slots);
  const benchDepthScore =
    averageBenchRank === null ? 35 : rounded(clamp(105 - averageBenchRank * 0.55, 0, 100));
  const draftDeltas = profile.draftPicks
    .map((pick) => pick.valueDelta)
    .filter((delta): delta is number => delta !== null);
  const averageDraftDelta = average(draftDeltas);
  const draftValueScore =
    averageDraftDelta === null ? null : rounded(clamp(50 + averageDraftDelta * 1.5, 0, 100));
  const scarcity = scarcityScore(profile, league, scoring);
  const scoringFit = scoringFitScore(profile, league, scoring);
  const injuryRiskCount = profile.players.filter(
    (player) => player.injuryStatus && player.injuryStatus !== 'Healthy',
  ).length;
  const unmatchedPlayersCount = profile.players.filter((player) => player.isUnmatched).length;

  let score = 70;
  score += averageStarterRank === null ? -12 : clamp((75 - averageStarterRank) / 5, -15, 15);
  score += averageBenchRank === null ? -5 : clamp((120 - averageBenchRank) / 12, -6, 10);
  score += Math.min(10, allRanks.filter((rank) => rank <= 24).length * 3);
  score += clamp((rosterBalanceScore - 60) / 5, -8, 8);
  score += clamp((scarcity - 50) / 8, -5, 6);
  score += clamp((scoringFit - 55) / 8, -4, 6);
  if (draftValueScore !== null) score += clamp((draftValueScore - 50) / 6.25, -8, 8);
  score -= Math.min(5, injuryRiskCount);
  score -= Math.min(5, (unmatchedPlayersCount / Math.max(1, profile.players.length)) * 10);

  const starterRankByPosition: Record<string, number | null> = {};
  for (const position of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
    starterRankByPosition[position] = average(
      starters
        .filter((player) => (player.position === 'DST' ? 'DEF' : player.position) === position)
        .map(playerRank)
        .filter((rank): rank is number => rank !== null),
    );
  }

  return {
    rosterId: profile.rosterId,
    averageStarterRank: averageStarterRank === null ? null : rounded(averageStarterRank),
    averageBenchRank: averageBenchRank === null ? null : rounded(averageBenchRank),
    bestPlayerRank: allRanks.length > 0 ? Math.min(...allRanks) : null,
    top24PlayersCount: allRanks.filter((rank) => rank <= 24).length,
    top50PlayersCount: allRanks.filter((rank) => rank <= 50).length,
    top100PlayersCount: allRanks.filter((rank) => rank <= 100).length,
    positionDepth: depth,
    starterRankByPosition,
    benchDepthScore,
    rosterBalanceScore,
    scarcityScore: scarcity,
    injuryRiskCount,
    unmatchedPlayersCount,
    draftValueScore,
    scoringFitScore: scoringFit,
    deterministicScore: Math.round(clamp(score, 40, 99)),
    draftPickValueAvailable: draftDeltas.length > 0,
  };
}
