import { createHash } from 'node:crypto';
import { config } from '../config/env';
import * as draftGradesRepo from '../db/repositories/draftGradesRepository';
import * as linkedUsersRepo from '../db/repositories/linkedUsersRepository';
import { teamNameForRoster, truncate } from '../utils/formatting';
import { UserFacingError } from '../utils/errors';
import * as sleeperApi from './sleeperApi';
import * as playerCache from './playerCache';
import { getFantasyProsRankings, matchSleeperPlayerToFantasyProsRanking } from './fantasyProsCache';
import { calculateDraftGradeMetrics, detectFantasyProsScoring } from './draftGradeMetricsService';
import { generateAIDraftGrades } from './aiDraftGradeService';
import type { GuildLeagueRow } from '../types/database';
import type { SleeperDraft, SleeperDraftPick, SleeperLeagueUser } from '../types/sleeper';
import type {
  AIDraftGradeTeam,
  DraftGrade,
  DraftGradeMetrics,
  DraftGradeTeamProfile,
  DraftGradeTeamResult,
  DraftGradesResult,
} from '../types/draftGrades';

const GRADE_RANGES: Record<DraftGrade, [number, number]> = {
  'A+': [97, 100],
  A: [93, 96],
  'A-': [90, 92],
  'B+': [87, 89],
  B: [83, 86],
  'B-': [80, 82],
  'C+': [77, 79],
  C: [73, 76],
  'C-': [70, 72],
  'D+': [67, 69],
  D: [63, 66],
  'D-': [60, 62],
  F: [40, 59],
};

const MIDDLE_GRADES: DraftGrade[] = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'];

export function missingDraftGradeConfiguration(): string[] {
  const missing: string[] = [];
  if (!config.fantasyProsApiKey) missing.push('FANTASYPROS_API_KEY');
  if (!config.openaiApiKey) missing.push('OPENAI_API_KEY');
  if (!config.openaiModel) missing.push('OPENAI_MODEL');
  return missing;
}

function relevantDraft(drafts: SleeperDraft[], season: string): SleeperDraft | null {
  const active = drafts.find((draft) => ['drafting', 'paused'].includes(draft.status));
  if (active) return active;
  const completedThisSeason = drafts.find(
    (draft) => draft.status === 'complete' && draft.season === season,
  );
  if (completedThisSeason) return completedThisSeason;
  return drafts.find((draft) => draft.status === 'complete') ?? drafts[0] ?? null;
}

function gradeForRank(index: number, total: number): DraftGrade {
  if (index === 0) return 'A+';
  if (index === total - 1) return 'F';
  const middleIndex = Math.round(
    ((index - 1) / Math.max(1, total - 3)) * (MIDDLE_GRADES.length - 1),
  );
  return MIDDLE_GRADES[middleIndex];
}

function scoreForGrade(grade: DraftGrade, suggested: number): number {
  const [min, max] = GRADE_RANGES[grade];
  return Math.round(Math.min(max, Math.max(min, suggested)));
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines
    .map((line) =>
      truncate(
        line
          .replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '')
          .replace(/\s+/g, ' ')
          .trim(),
        280,
      ),
    )
    .filter((line) => {
      if (!line || seen.has(line.toLowerCase())) return false;
      seen.add(line.toLowerCase());
      return true;
    });
}

function fallbackStrengths(metrics: DraftGradeMetrics): string[] {
  const lines: string[] = [];
  if (metrics.top24PlayersCount > 0) {
    lines.push(`Features ${metrics.top24PlayersCount} top-24 FantasyPros-ranked player(s).`);
  }
  if (metrics.averageStarterRank !== null && metrics.averageStarterRank <= 75) {
    lines.push('The projected starting group compares well by FantasyPros consensus rank.');
  }
  if (metrics.benchDepthScore >= 60) lines.push('Bench rankings provide useful lineup depth.');
  if (metrics.rosterBalanceScore >= 65)
    lines.push('Roster construction is balanced across core positions.');
  if (metrics.draftValueScore !== null && metrics.draftValueScore >= 55) {
    lines.push('Draft selections generally landed at favorable value versus consensus rank.');
  }
  if (metrics.scoringFitScore >= 65)
    lines.push('The roster fits this league’s lineup and scoring format well.');
  lines.push('The roster has at least one dependable building block for the season.');
  return uniqueLines(lines);
}

function fallbackWeaknesses(metrics: DraftGradeMetrics): string[] {
  const lines: string[] = [];
  if (metrics.averageStarterRank === null || metrics.averageStarterRank > 100) {
    lines.push(
      'The starting group has fewer highly ranked options than the league’s stronger teams.',
    );
  }
  if (metrics.benchDepthScore < 50)
    lines.push('Bench depth could be vulnerable during injuries and bye weeks.');
  if (metrics.rosterBalanceScore < 60)
    lines.push('Position depth is uneven relative to the required lineup slots.');
  if (metrics.draftValueScore !== null && metrics.draftValueScore < 45) {
    lines.push('Several selections came earlier than their FantasyPros consensus value.');
  }
  if (metrics.injuryRiskCount > 0) {
    lines.push(`${metrics.injuryRiskCount} player(s) carry a current Sleeper injury designation.`);
  }
  if (metrics.unmatchedPlayersCount > 0) {
    lines.push(
      `FantasyPros rankings were unavailable for ${metrics.unmatchedPlayersCount} rostered player(s).`,
    );
  }
  lines.push('Some roster spots have more uncertainty than the top teams in this league.');
  return uniqueLines(lines);
}

function requiredCounts(
  grade: DraftGrade,
  score: number,
): { strengths: number; weaknesses: number } {
  if (['A+', 'A', 'A-', 'B+'].includes(grade) || score >= 85) {
    return { strengths: 3, weaknesses: 1 };
  }
  if (['D+', 'D', 'D-', 'F'].includes(grade) || score < 65) {
    return { strengths: 1, weaknesses: 3 };
  }
  return { strengths: 2, weaknesses: 2 };
}

function exactLines(
  primary: string[],
  fallback: string[],
  count: number,
  generic: string,
): string[] {
  const combined = uniqueLines([...primary, ...fallback]);
  while (combined.length < count) combined.push(`${generic} (${combined.length + 1})`);
  return combined.slice(0, count);
}

export function normalizeDraftGradeResults(
  profiles: DraftGradeTeamProfile[],
  metrics: DraftGradeMetrics[],
  aiTeams: AIDraftGradeTeam[] | null,
): DraftGradeTeamResult[] {
  const metricsByRoster = new Map(metrics.map((entry) => [entry.rosterId, entry]));
  const aiByRoster = new Map((aiTeams ?? []).map((entry) => [entry.roster_id, entry]));
  const ranked = profiles
    .map((profile) => {
      const teamMetrics = metricsByRoster.get(profile.rosterId) as DraftGradeMetrics;
      const ai = aiByRoster.get(profile.rosterId);
      const aiScore =
        ai && Number.isFinite(ai.initial_score) ? ai.initial_score : teamMetrics.deterministicScore;
      return {
        profile,
        metrics: teamMetrics,
        ai,
        blendedScore: Math.min(
          99,
          Math.max(40, teamMetrics.deterministicScore * 0.75 + aiScore * 0.25),
        ),
      };
    })
    .sort((a, b) => b.blendedScore - a.blendedScore || a.profile.rosterId - b.profile.rosterId);

  return ranked.map((entry, index) => {
    const grade = gradeForRank(index, ranked.length);
    const score = scoreForGrade(grade, entry.blendedScore);
    const counts = requiredCounts(grade, score);
    const strengths = exactLines(
      entry.ai?.strengths ?? [],
      fallbackStrengths(entry.metrics),
      counts.strengths,
      'This team has a useful foundation to build around',
    );
    const weaknesses = exactLines(
      entry.ai?.weaknesses ?? [],
      fallbackWeaknesses(entry.metrics),
      counts.weaknesses,
      'Depth in one area trails the strongest rosters in this league',
    );
    let summary =
      entry.ai?.summary?.trim() ||
      `This roster earned a ${grade} relative to this league based on FantasyPros rankings, roster construction, and league fit.`;
    if (grade === 'F' && !summary.toLowerCase().includes('most questions')) {
      summary = `${summary} Relative to this league, this roster has the most questions.`;
    }
    return {
      roster_id: entry.profile.rosterId,
      sleeper_user_id: entry.profile.sleeperUserId,
      discord_user_id: entry.profile.discordUserId,
      team_name: entry.profile.teamName,
      manager_name: entry.profile.managerName,
      grade,
      score,
      strengths,
      weaknesses,
      summary: truncate(summary.replace(/\s+/g, ' ').trim(), 700),
      metrics: entry.metrics,
    };
  });
}

function inputHash(input: object): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export interface CreateDraftGradesOptions {
  guildId: string;
  guildLeague: GuildLeagueRow;
  generatedByDiscordUserId: string;
}

export async function createDraftGrades(
  options: CreateDraftGradesOptions,
): Promise<DraftGradesResult> {
  const missing = missingDraftGradeConfiguration();
  if (missing.length > 0) {
    throw new UserFacingError(
      `Draft grades are not configured yet. Missing ${missing.join(' or ')}.`,
      'Draft grades not configured',
    );
  }

  const leagueId = options.guildLeague.league_id;
  const [league, users, rosters, drafts, players] = await Promise.all([
    sleeperApi.getLeague(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueDrafts(leagueId),
    playerCache.getAllPlayers(),
  ]);
  if (!league || !users || !rosters) {
    throw new UserFacingError(
      'I could not load all required Sleeper league data. Try again later.',
    );
  }
  if (rosters.length < 2 || rosters.every((roster) => (roster.players ?? []).length === 0)) {
    throw new UserFacingError(
      'This league does not appear to have drafted yet, so I cannot create useful draft grades.',
      'No drafted rosters found',
    );
  }

  const scoring = detectFantasyProsScoring(league);
  const rankingSnapshot = await getFantasyProsRankings(league.season, scoring);
  const draft = relevantDraft(drafts ?? [], league.season);
  const picks: SleeperDraftPick[] = draft
    ? ((await sleeperApi.getDraftPicks(draft.draft_id)) ?? [])
    : [];
  const usersById = new Map<string, SleeperLeagueUser>(users.map((user) => [user.user_id, user]));
  const ownerIds = rosters.flatMap((roster) => (roster.owner_id ? [roster.owner_id] : []));
  const linkedUsers = await linkedUsersRepo.getLinkedUsersBySleeperIds(ownerIds);
  const linkedBySleeperId = new Map(linkedUsers.map((linked) => [linked.sleeper_user_id, linked]));

  const profiles: DraftGradeTeamProfile[] = rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const linked = roster.owner_id ? linkedBySleeperId.get(roster.owner_id) : undefined;
    const starterIds = new Set(roster.starters ?? []);
    const reserveIds = new Set(roster.reserve ?? []);
    const taxiIds = new Set(roster.taxi ?? []);
    const rosterPlayers = (roster.players ?? []).map((playerId) => {
      const sleeperPlayer = players[playerId] ?? { player_id: playerId, full_name: playerId };
      const match = matchSleeperPlayerToFantasyProsRanking(sleeperPlayer, rankingSnapshot.rankings);
      return {
        sleeperPlayerId: playerId,
        name: playerCache.formatPlayerName(sleeperPlayer, playerId),
        position: (
          sleeperPlayer.position ??
          sleeperPlayer.fantasy_positions?.[0] ??
          '?'
        ).toUpperCase(),
        team: sleeperPlayer.team ?? null,
        isStarter: starterIds.has(playerId),
        isReserve: reserveIds.has(playerId),
        isTaxi: taxiIds.has(playerId),
        injuryStatus: sleeperPlayer.injury_status ?? null,
        fantasyprosOverallRank: match.ranking?.overallRank ?? null,
        fantasyprosPositionRank: match.ranking?.positionRank ?? null,
        fantasyprosTier: match.ranking?.tier ?? null,
        fantasyprosAdp: match.ranking?.adp ?? null,
        rankingMatchConfidence: match.confidence,
        isUnmatched: match.ranking === null,
      };
    });
    const playerById = new Map(rosterPlayers.map((player) => [player.sleeperPlayerId, player]));
    const draftPicks = picks
      .filter((pick) => pick.roster_id === roster.roster_id)
      .map((pick) => {
        const rankedPlayer = playerById.get(pick.player_id);
        const overallRank =
          rankedPlayer?.fantasyprosOverallRank ?? rankedPlayer?.fantasyprosAdp ?? null;
        return {
          playerId: pick.player_id,
          pickNumber: pick.pick_no,
          overallRank,
          valueDelta: overallRank === null ? null : pick.pick_no - overallRank,
        };
      });
    return {
      rosterId: roster.roster_id,
      sleeperUserId: roster.owner_id ?? '',
      discordUserId: linked?.discord_user_id ?? null,
      teamName: teamNameForRoster(roster, usersById),
      managerName: owner?.display_name ?? owner?.username ?? `Roster ${roster.roster_id}`,
      players: rosterPlayers,
      draftPicks,
    };
  });

  const metrics = profiles.map((profile) => calculateDraftGradeMetrics(profile, league, scoring));
  const hashPayload = {
    league_id: leagueId,
    season: league.season,
    rosters: profiles.map((profile) => ({
      roster_id: profile.rosterId,
      players: profile.players.map((player) => player.sleeperPlayerId).sort(),
    })),
    draft_picks: picks.map((pick) => pick.player_id),
    rankings_fetched_at: rankingSnapshot.fetchedAt,
  };
  const aiResponse = await generateAIDraftGrades({
    leagueName: league.name,
    season: league.season,
    scoringSettings: league.scoring_settings ?? {},
    rosterPositions: league.roster_positions ?? [],
    draftPickValueAvailable: picks.length > 0,
    teams: profiles.map((profile, index) => ({ profile, metrics: metrics[index] })),
  });
  const teams = normalizeDraftGradeResults(profiles, metrics, aiResponse?.teams ?? null);
  const result: DraftGradesResult = {
    version: 1,
    league_id: leagueId,
    league_nickname: options.guildLeague.league_nickname,
    league_name: league.name,
    season: league.season,
    ranking_source: 'fantasypros',
    ranking_type: rankingSnapshot.rankingType,
    scoring,
    generated_at: new Date().toISOString(),
    ai_analysis_used: aiResponse !== null,
    league_summary:
      aiResponse?.league_summary?.trim() ||
      'Grades were generated from deterministic FantasyPros ranking and roster-construction metrics.',
    draft_pick_value_available: picks.length > 0,
    teams,
  };

  try {
    await draftGradesRepo.insertDraftGrade({
      guild_id: options.guildId,
      league_id: leagueId,
      league_nickname: options.guildLeague.league_nickname,
      league_name: league.name,
      season: league.season,
      generated_by_discord_user_id: options.generatedByDiscordUserId,
      model_provider: aiResponse ? 'openai' : 'deterministic-fallback',
      model_name: config.openaiModel as string,
      ranking_source: 'fantasypros',
      ranking_type: rankingSnapshot.rankingType,
      input_hash: inputHash(hashPayload),
      result,
    });
  } catch {
    throw new UserFacingError(
      'Draft grades were generated, but I could not save them in Supabase. Ask the bot administrator to apply the latest database schema and try again.',
      'Could not save draft grades',
    );
  }
  return result;
}

export async function getLatestDraftGrades(
  guildId: string,
  leagueId: string,
): Promise<DraftGradesResult | null> {
  try {
    return (await draftGradesRepo.getLatestDraftGrade(guildId, leagueId))?.result ?? null;
  } catch {
    throw new UserFacingError(
      'I could not read saved draft grades right now. Ask the bot administrator to check Supabase.',
      'Could not load draft grades',
    );
  }
}
