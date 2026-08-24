import assert from 'node:assert/strict';
import test from 'node:test';
import type { DraftGradeMetrics, DraftGradeTeamProfile, PositionDepth } from '../types/draftGrades';

const emptyDepth: PositionDepth = { QB: 1, RB: 4, WR: 5, TE: 2, K: 1, DEF: 1, IR: 0, TAXI: 0 };

function configureTestEnvironment(): void {
  process.env.DISCORD_TOKEN ||= 'test-token';
  process.env.DISCORD_CLIENT_ID ||= 'test-client';
  process.env.DISCORD_GUILD_ID ||= 'test-guild';
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role';
  process.env.NODE_ENV ||= 'test';
}

function profile(rosterId: number): DraftGradeTeamProfile {
  return {
    rosterId,
    sleeperUserId: `user-${rosterId}`,
    discordUserId: null,
    teamName: `Team ${rosterId}`,
    managerName: `Manager ${rosterId}`,
    players: [],
    draftPicks: [],
  };
}

function metrics(rosterId: number): DraftGradeMetrics {
  return {
    rosterId,
    averageStarterRank: 40 + rosterId * 5,
    averageBenchRank: 80 + rosterId * 5,
    bestPlayerRank: rosterId,
    top24PlayersCount: rosterId <= 3 ? 2 : 0,
    top50PlayersCount: rosterId <= 6 ? 3 : 0,
    top100PlayersCount: 4,
    positionDepth: emptyDepth,
    starterRankByPosition: {},
    benchDepthScore: 90 - rosterId * 4,
    rosterBalanceScore: 85 - rosterId * 3,
    scarcityScore: 70,
    injuryRiskCount: 0,
    unmatchedPlayersCount: 0,
    draftValueScore: null,
    scoringFitScore: 70,
    deterministicScore: 100 - rosterId * 4,
    draftPickValueAvailable: false,
  };
}

test('normalization guarantees one A+, one F, scores, and exact feedback counts', async () => {
  configureTestEnvironment();
  const { normalizeDraftGradeResults } = await import('./draftGradeService.js');
  const profiles = Array.from({ length: 12 }, (_, index) => profile(index + 1));
  const metricRows = Array.from({ length: 12 }, (_, index) => metrics(index + 1));
  const result = normalizeDraftGradeResults(profiles, metricRows, null);

  assert.equal(result.length, 12);
  assert.equal(result.filter((team) => team.grade === 'A+').length, 1);
  assert.equal(result.filter((team) => team.grade === 'F').length, 1);
  for (const team of result) {
    assert.equal(Number.isFinite(team.score), true);
    assert.ok(team.strengths.length >= 1);
    assert.ok(team.weaknesses.length >= 1);
    assert.equal((team.projected_wins ?? 0) + (team.projected_losses ?? 0), 15);
    assert.match(team.projected_record ?? '', /^\d{1,2}-\d{1,2}$/);
    if (['A+', 'A', 'A-', 'B+'].includes(team.grade) || team.score >= 85) {
      assert.equal(team.strengths.length, 3);
      assert.equal(team.weaknesses.length, 1);
    } else if (['D+', 'D', 'D-', 'F'].includes(team.grade) || team.score < 65) {
      assert.equal(team.strengths.length, 1);
      assert.equal(team.weaknesses.length, 3);
    } else {
      assert.equal(team.strengths.length, 2);
      assert.equal(team.weaknesses.length, 2);
    }
  }
  assert.deepEqual(
    result.map((team) => team.projected_power_rank).sort((a, b) => (a ?? 0) - (b ?? 0)),
    Array.from({ length: 12 }, (_, index) => index + 1),
  );
});

test('record projection blends AI judgment and limits provider references per team', async () => {
  configureTestEnvironment();
  const { normalizeDraftGradeResults } = await import('./draftGradeService.js');
  const profiles = Array.from({ length: 12 }, (_, index) => profile(index + 1));
  const metricRows = Array.from({ length: 12 }, (_, index) => metrics(index + 1));
  const baseline = normalizeDraftGradeResults(profiles, metricRows, null);
  const withAi = normalizeDraftGradeResults(profiles, metricRows, [
    {
      roster_id: 1,
      sleeper_user_id: 'user-1',
      team_name: 'Team 1',
      manager_name: 'Manager 1',
      initial_score: 96,
      projected_wins: 9,
      grade: 'A',
      strengths: ['FantasyPros consensus ADP says this roster found value.'],
      weaknesses: ['FantasyPros rankings expose one risky position.'],
      summary: 'Compared with FantasyPros consensus rankings, this team is strong.',
    },
  ]);
  const baselineTeam = baseline.find((team) => team.roster_id === 1);
  const aiTeam = withAi.find((team) => team.roster_id === 1);

  assert.ok(baselineTeam && aiTeam);
  assert.notEqual(aiTeam.projected_wins, baselineTeam.projected_wins);
  assert.equal((aiTeam.projected_wins ?? 0) + (aiTeam.projected_losses ?? 0), 15);
  const feedbackLines = [...aiTeam.strengths, ...aiTeam.weaknesses, aiTeam.summary];
  const providerLines = feedbackLines.filter((line) => /FantasyPros|consensus|\bADP\b/i.test(line));
  assert.equal(providerLines.length, 1);
});

test('feedback templates stay unique across teams even when AI only swaps team names', async () => {
  configureTestEnvironment();
  const { normalizeDraftGradeResults } = await import('./draftGradeService.js');
  const profiles = Array.from({ length: 12 }, (_, index) => profile(index + 1));
  const metricRows = Array.from({ length: 12 }, (_, index) => metrics(index + 1));
  const aiTeams = profiles.map((team) => ({
    roster_id: team.rosterId,
    sleeper_user_id: team.sleeperUserId,
    team_name: team.teamName,
    manager_name: team.managerName,
    initial_score: metrics(team.rosterId).deterministicScore,
    projected_wins: 8,
    grade: 'B' as const,
    strengths: [`${team.teamName} has a core that can swing matchups.`],
    weaknesses: [`${team.teamName} may struggle when the bench is tested.`],
    summary: `${team.teamName} has a balanced roster with playoff upside.`,
  }));
  const result = normalizeDraftGradeResults(profiles, metricRows, aiTeams);
  const canonicalFeedback = result.flatMap((team) =>
    [...team.strengths, ...team.weaknesses, team.summary].map((line) =>
      line
        .replace(/Team \d+/gi, '{team}')
        .replace(/Manager \d+/gi, '{manager}')
        .replace(/\b\d+(?:\.\d+)?\b/g, '{number}')
        .toLowerCase(),
    ),
  );
  assert.equal(new Set(canonicalFeedback).size, canonicalFeedback.length);
});

test('FantasyPros matching uses normalized name, position, and team confidence', async () => {
  configureTestEnvironment();
  const { matchSleeperPlayerToFantasyProsRanking } = await import('./fantasyProsCache.js');
  const rankings = [
    {
      fantasyprosPlayerId: 1,
      playerName: "D'Andre Swift",
      position: 'RB',
      team: 'CHI',
      overallRank: 42,
      positionRank: 'RB18',
      tier: 4,
      adp: 45,
    },
  ];
  const high = matchSleeperPlayerToFantasyProsRanking(
    { player_id: '1', full_name: 'D’Andre Swift', position: 'RB', team: 'CHI' },
    rankings,
  );
  assert.equal(high.confidence, 'high');
  assert.equal(high.ranking?.overallRank, 42);

  const medium = matchSleeperPlayerToFantasyProsRanking(
    { player_id: '1', full_name: "D'Andre Swift", position: 'RB', team: 'DET' },
    rankings,
  );
  assert.equal(medium.confidence, 'medium');

  const unmatched = matchSleeperPlayerToFantasyProsRanking(
    { player_id: '2', full_name: 'Different Player', position: 'RB', team: 'CHI' },
    rankings,
  );
  assert.equal(unmatched.confidence, 'none');
  assert.equal(unmatched.ranking, null);
});
