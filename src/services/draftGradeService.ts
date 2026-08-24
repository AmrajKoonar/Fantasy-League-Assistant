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
  if (config.aiProvider === 'github') {
    if (!config.githubModelsToken) missing.push('GITHUB_MODELS_TOKEN');
  } else {
    if (!config.openaiApiKey) missing.push('OPENAI_API_KEY');
    if (!config.openaiModel) missing.push('OPENAI_MODEL');
  }
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

function playerRank(profile: DraftGradeTeamProfile, playerName: string): number {
  const player = profile.players.find((candidate) => candidate.name === playerName);
  return player?.fantasyprosOverallRank ?? player?.fantasyprosAdp ?? Number.POSITIVE_INFINITY;
}

function corePlayerNames(profile: DraftGradeTeamProfile, count = 2): string[] {
  return profile.players
    .filter((player) => player.isStarter)
    .map((player) => player.name)
    .sort((a, b) => playerRank(profile, a) - playerRank(profile, b))
    .slice(0, count);
}

function strongestSkillPosition(metrics: DraftGradeMetrics): 'RB' | 'WR' | 'TE' {
  const positions: Array<'RB' | 'WR' | 'TE'> = ['RB', 'WR', 'TE'];
  return positions.sort((a, b) => metrics.positionDepth[b] - metrics.positionDepth[a])[0];
}

function fallbackStrengths(profile: DraftGradeTeamProfile, metrics: DraftGradeMetrics): string[] {
  const lines: string[] = [];
  const core = corePlayerNames(profile);
  if (core.length >= 2) {
    lines.push(`${core[0]} and ${core[1]} give this lineup a core that can swing matchups.`);
  } else if (core.length === 1) {
    lines.push(`${core[0]} gives the roster a clear centerpiece to build weekly lineups around.`);
  }
  if (metrics.averageStarterRank !== null && metrics.averageStarterRank <= 75) {
    lines.push(
      'The starting lineup carries enough weekly ceiling to win without everything breaking perfectly.',
    );
  }
  if (metrics.benchDepthScore >= 60) {
    lines.push('The bench has credible answers for bye weeks instead of emergency-only depth.');
  }
  if (metrics.rosterBalanceScore >= 65) {
    lines.push(
      'The build is balanced enough that no position group immediately feels like a repair job.',
    );
  }
  if (metrics.draftValueScore !== null && metrics.draftValueScore >= 55) {
    lines.push(
      'FantasyPros consensus value suggests this roster found several favorable draft-day prices without sacrificing structure.',
    );
  }
  if (metrics.scoringFitScore >= 65) {
    lines.push(
      'This roster looks purpose-built for the league settings rather than copied from a generic draft sheet.',
    );
  }
  const deepPosition = strongestSkillPosition(metrics);
  if (metrics.positionDepth[deepPosition] >= 4) {
    lines.push(
      `The ${deepPosition} room offers multiple lineup combinations and protection against a cold streak.`,
    );
  }
  lines.push(
    'There is a clear weekly game plan here, with enough upside to make the roster dangerous.',
  );
  return uniqueLines(lines);
}

function fallbackWeaknesses(profile: DraftGradeTeamProfile, metrics: DraftGradeMetrics): string[] {
  const lines: string[] = [];
  if (metrics.averageStarterRank === null || metrics.averageStarterRank > 100) {
    lines.push('The starters may need more breakout outcomes than the league’s safest lineups.');
  }
  if (metrics.benchDepthScore < 50) {
    lines.push(
      'The bench gets thin quickly, so injuries and heavy bye weeks could force uncomfortable starts.',
    );
  }
  if (metrics.rosterBalanceScore < 60) {
    lines.push(
      'The roster is lopsided enough that one position could become a weekly waiver-wire assignment.',
    );
  }
  if (metrics.draftValueScore !== null && metrics.draftValueScore < 45) {
    lines.push(
      'FantasyPros consensus value flags a few aggressive picks that now need to hit quickly.',
    );
  }
  if (metrics.injuryRiskCount > 0) {
    lines.push(`${metrics.injuryRiskCount} current injury flag(s) add early-season volatility.`);
  }
  if (metrics.unmatchedPlayersCount > 0) {
    lines.push(
      `${metrics.unmatchedPlayersCount} player(s) carry a wider range of outcomes than the established core.`,
    );
  }
  const core = corePlayerNames(profile, 1);
  if (core.length === 1 && metrics.benchDepthScore < 60) {
    lines.push(
      `A lot of the weekly ceiling rests on ${core[0]}, with limited margin if the supporting cast stalls.`,
    );
  }
  lines.push(
    'The path to the playoffs is there, but this build has less room for missed breakouts than the top tier.',
  );
  return uniqueLines(lines);
}

const PROVIDER_REFERENCE = /FantasyPros|consensus|\bADP\b/i;

function neutralizeProviderReference(text: string): string {
  return text
    .replace(/FantasyPros(?:'s)?\s+consensus\s+ADP/gi, 'the typical draft range')
    .replace(/FantasyPros(?:'s)?\s+consensus\s+(?:rankings?|ranks?)/gi, 'preseason expectations')
    .replace(/FantasyPros(?:'s)?/gi, 'the ranking model')
    .replace(/consensus\s+ADP/gi, 'typical draft range')
    .replace(/consensus\s+(?:rankings?|ranks?)/gi, 'preseason expectations')
    .replace(/\bADP\b/g, 'draft-day price')
    .replace(/\s+/g, ' ')
    .trim();
}

function providerReferenceLimiter(): (text: string) => string {
  let directReferenceUsed = false;
  return (text: string): string => {
    if (!PROVIDER_REFERENCE.test(text)) return text;
    if (!directReferenceUsed) {
      directReferenceUsed = true;
      return text;
    }
    return neutralizeProviderReference(text);
  };
}

function projectedWinsFromScore(score: number): number {
  return Math.min(13, Math.max(3, 3 + ((score - 40) / 59) * 10));
}

function blendedProjectedWins(score: number, aiProjectedWins: number | undefined): number {
  const gradeProjection = projectedWinsFromScore(score);
  const aiProjection =
    aiProjectedWins !== undefined && Number.isFinite(aiProjectedWins)
      ? Math.min(15, Math.max(0, aiProjectedWins))
      : gradeProjection;
  return Math.min(15, Math.max(0, Math.round(gradeProjection * 0.65 + aiProjection * 0.35)));
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function feedbackIdentityTokens(profiles: DraftGradeTeamProfile[]): string[] {
  return [
    ...new Set(
      profiles.flatMap((profile) => [
        profile.teamName,
        profile.managerName,
        ...profile.players.map((player) => player.name),
      ]),
    ),
  ]
    .filter((value) => value.trim().length >= 3)
    .sort((a, b) => b.length - a.length);
}

function feedbackSignature(text: string, identityTokens: string[]): string {
  let signature = text.toLowerCase();
  for (const token of identityTokens) {
    signature = signature.replace(new RegExp(escapeRegExp(token.toLowerCase()), 'g'), '{name}');
  }
  return signature
    .replace(/\b\d+(?:\.\d+)?\b/g, '{number}')
    .replace(/[^a-z{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function emergencyFeedback(
  profile: DraftGradeTeamProfile,
  metrics: DraftGradeMetrics,
  kind: 'strength' | 'weakness' | 'summary',
  attempt: number,
): string {
  const strengthOpeners = [
    'The weekly blueprint starts with',
    'This roster can lean on',
    'Its clearest matchup advantage comes from',
    'The lineup’s most bankable feature is',
    'A flexible game plan grows out of',
    'The roster’s identity is anchored by',
    'When the lineup clicks, it will be because of',
    'The safest route to weekly points runs through',
    'This build separated itself by investing in',
    'A strong floor begins with',
    'The most convincing part of this draft is',
    'The roster gives its manager room to win through',
  ];
  const weaknessOpeners = [
    'The first stress point appears when',
    'This roster becomes fragile if',
    'The weekly margin gets uncomfortable around',
    'Its biggest lineup puzzle will be',
    'The build may need an early waiver answer because',
    'A rough bye week could expose',
    'The roster’s floor depends heavily on',
    'The clearest risk is concentrated in',
    'This team can lose flexibility when',
    'The season gets trickier if',
    'One cold stretch could magnify',
    'The manager may need to stay aggressive because',
  ];
  const summaryOpeners = [
    'This is a ceiling-first build with enough structure to contend.',
    'The roster looks steady, but its best weeks should still carry some fireworks.',
    'There is a playoff path here built more on balance than perfection.',
    'This draft produced a volatile contender rather than a finished product.',
    'The team leaves draft night with a clear identity and a manageable repair list.',
    'A dependable core gives this roster a real chance to outperform its rough edges.',
    'This lineup should be competitive early while the bench determines its final tier.',
    'The roster blends a useful floor with just enough breakout fuel to climb.',
    'The construction is unconventional, but the weekly upside makes it worth watching.',
    'This team should stay in most matchups, with depth deciding the close ones.',
    'The draft created a strong starting point without removing every source of risk.',
    'This roster feels capable of a run, provided its thinner spots hold together.',
  ];
  if (kind === 'summary') {
    return summaryOpeners[(profile.rosterId + attempt) % summaryOpeners.length];
  }

  const core = corePlayerNames(profile);
  const coreLabel = core.length > 0 ? core.join(' and ') : 'the projected starters';
  const position = strongestSkillPosition(metrics);
  const strengthDetails = [
    `${coreLabel}, which supplies a reliable source of weekly ceiling.`,
    `a ${position} group with ${metrics.positionDepth[position]} playable options and multiple lineup paths.`,
    `bench flexibility that can absorb the awkward parts of the schedule.`,
    `a starting unit that does not need a perfect game script to produce.`,
    `position balance that should reduce desperate waiver decisions.`,
    `enough scoring-format fit to turn roster depth into usable points.`,
    `a core capable of winning both high-scoring weeks and tighter matchups.`,
    `several players who can change the lineup’s shape as roles develop.`,
  ];
  const weaknessDetails = [
    `the depth behind ${coreLabel} is asked to carry a larger role.`,
    `the ${position} room cannot cover every injury or bye-week collision.`,
    `a starter misses time and the bench has to supply immediate answers.`,
    `multiple uncertain roles land in the lineup during the same week.`,
    `the roster is forced away from its preferred lineup construction.`,
    `an aggressive draft bet takes longer than expected to pay off.`,
    `the waiver wire cannot quickly patch the thinner position groups.`,
    `weekly lineup choices require upside that the bench may not consistently provide.`,
  ];
  const openers = kind === 'strength' ? strengthOpeners : weaknessOpeners;
  const details = kind === 'strength' ? strengthDetails : weaknessDetails;
  return `${openers[(profile.rosterId * 3 + attempt) % openers.length]} ${details[(profile.rosterId * 5 + attempt * 7) % details.length]}`;
}

function exactUniqueLines(
  primary: string[],
  fallback: string[],
  count: number,
  profile: DraftGradeTeamProfile,
  metrics: DraftGradeMetrics,
  kind: 'strength' | 'weakness' | 'summary',
  identityTokens: string[],
  usedSignatures: Set<string>,
): string[] {
  const result: string[] = [];
  const candidates = uniqueLines([...primary, ...fallback]);
  for (const candidate of candidates) {
    const signature = feedbackSignature(candidate, identityTokens);
    if (!signature || usedSignatures.has(signature)) continue;
    usedSignatures.add(signature);
    result.push(candidate);
    if (result.length === count) return result;
  }
  for (let attempt = 0; result.length < count && attempt < 200; attempt += 1) {
    const candidate = emergencyFeedback(profile, metrics, kind, attempt);
    const signature = feedbackSignature(candidate, identityTokens);
    if (!signature || usedSignatures.has(signature)) continue;
    usedSignatures.add(signature);
    result.push(candidate);
  }
  return result;
}

export function normalizeDraftGradeResults(
  profiles: DraftGradeTeamProfile[],
  metrics: DraftGradeMetrics[],
  aiTeams: AIDraftGradeTeam[] | null,
): DraftGradeTeamResult[] {
  const metricsByRoster = new Map(metrics.map((entry) => [entry.rosterId, entry]));
  const aiByRoster = new Map((aiTeams ?? []).map((entry) => [entry.roster_id, entry]));
  const identityTokens = feedbackIdentityTokens(profiles);
  const usedFeedbackSignatures = new Set<string>();
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

  const results: DraftGradeTeamResult[] = ranked.map((entry, index) => {
    const grade = gradeForRank(index, ranked.length);
    const score = scoreForGrade(grade, entry.blendedScore);
    const counts = requiredCounts(grade, score);
    const limitProviderReference = providerReferenceLimiter();
    const strengths = exactUniqueLines(
      (entry.ai?.strengths ?? []).map(limitProviderReference),
      fallbackStrengths(entry.profile, entry.metrics).map(limitProviderReference),
      counts.strengths,
      entry.profile,
      entry.metrics,
      'strength',
      identityTokens,
      usedFeedbackSignatures,
    );
    const weaknesses = exactUniqueLines(
      (entry.ai?.weaknesses ?? []).map(limitProviderReference),
      fallbackWeaknesses(entry.profile, entry.metrics).map(limitProviderReference),
      counts.weaknesses,
      entry.profile,
      entry.metrics,
      'weakness',
      identityTokens,
      usedFeedbackSignatures,
    );
    const summaryInput = limitProviderReference(
      entry.ai?.summary?.trim() ||
        `${entry.profile.teamName} has a ${grade}-level foundation: enough weekly upside to compete, with its season likely decided by depth and lineup consistency.`,
    );
    let summary = exactUniqueLines(
      [summaryInput],
      [],
      1,
      entry.profile,
      entry.metrics,
      'summary',
      identityTokens,
      usedFeedbackSignatures,
    )[0];
    if (grade === 'F' && !summary.toLowerCase().includes('most questions')) {
      summary = `${summary} Relative to this league, this roster has the most questions.`;
    }
    const projectedWins = blendedProjectedWins(score, entry.ai?.projected_wins);
    return {
      roster_id: entry.profile.rosterId,
      sleeper_user_id: entry.profile.sleeperUserId,
      discord_user_id: entry.profile.discordUserId,
      team_name: entry.profile.teamName,
      manager_name: entry.profile.managerName,
      grade,
      score,
      projected_wins: projectedWins,
      projected_losses: 15 - projectedWins,
      projected_record: `${projectedWins}-${15 - projectedWins}`,
      strengths,
      weaknesses,
      summary: truncate(summary.replace(/\s+/g, ' ').trim(), 700),
      metrics: entry.metrics,
    };
  });

  const powerOrder = [...results].sort(
    (a, b) =>
      (b.projected_wins ?? 0) - (a.projected_wins ?? 0) ||
      b.score - a.score ||
      a.team_name.localeCompare(b.team_name),
  );
  powerOrder.forEach((team, index) => {
    team.projected_power_rank = index + 1;
  });
  return results;
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
  // Regeneration intentionally bypasses the in-memory cache so rankings are current.
  const rankingSnapshot = await getFantasyProsRankings(league.season, scoring, {
    forceRefresh: true,
  });
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
    version: 2,
    league_id: leagueId,
    league_nickname: options.guildLeague.league_nickname,
    league_name: league.name,
    season: league.season,
    ranking_source: 'fantasypros',
    ranking_type: rankingSnapshot.rankingType,
    scoring,
    generated_at: new Date().toISOString(),
    rankings_updated_at: rankingSnapshot.sourceUpdatedAt ?? rankingSnapshot.fetchedAt,
    ai_analysis_used: aiResponse !== null,
    league_summary:
      aiResponse?.league_summary?.trim() ||
      'The league has a clear top tier, a crowded middle, and several volatile rosters capable of changing the order quickly.',
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
      model_provider: aiResponse
        ? config.aiProvider === 'github'
          ? 'github-models'
          : 'openai'
        : 'deterministic-fallback',
      model_name:
        config.aiProvider === 'github' ? config.githubModelsModel : (config.openaiModel ?? 'none'),
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
