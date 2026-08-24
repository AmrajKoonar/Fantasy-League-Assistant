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
  const players = [
    {
      sleeperPlayerId: `player-${rosterId}-a`,
      name: `Player ${rosterId} Alpha`,
      position: 'RB',
      team: 'SEA',
      isStarter: true,
      isReserve: false,
      isTaxi: false,
      injuryStatus: null,
      fantasyprosOverallRank: rosterId,
      fantasyprosPositionRank: `RB${rosterId}`,
      fantasyprosTier: 1,
      fantasyprosAdp: rosterId + 1,
      rankingMatchConfidence: 'high' as const,
      isUnmatched: false,
    },
    {
      sleeperPlayerId: `player-${rosterId}-b`,
      name: `Player ${rosterId} Beta`,
      position: 'WR',
      team: 'BUF',
      isStarter: false,
      isReserve: true,
      isTaxi: false,
      injuryStatus: rosterId === 1 ? 'Questionable' : null,
      fantasyprosOverallRank: 50 + rosterId,
      fantasyprosPositionRank: `WR${rosterId}`,
      fantasyprosTier: 5,
      fantasyprosAdp: 50 + rosterId,
      rankingMatchConfidence: 'high' as const,
      isUnmatched: false,
    },
  ];
  return {
    rosterId,
    sleeperUserId: `user-${rosterId}`,
    discordUserId: null,
    teamName: `Team ${rosterId}`,
    managerName: `Manager ${rosterId}`,
    players,
    draftPicks: [
      {
        playerId: players[0].sleeperPlayerId,
        pickNumber: 1,
        overallRank: players[0].fantasyprosOverallRank,
        valueDelta: -12,
      },
    ],
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
    assert.ok((team.advanced_metrics?.length ?? 0) >= 2);
    assert.ok((team.advanced_metrics?.length ?? 0) <= 3);
    const roster = profiles.find((entry) => entry.rosterId === team.roster_id);
    assert.ok(roster);
    for (const line of [...team.strengths, ...team.weaknesses]) {
      assert.ok(roster.players.some((player) => line.includes(player.name)));
    }
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
  const injuredTeam = result.find((team) => team.roster_id === 1);
  assert.doesNotMatch(injuredTeam?.advanced_metrics?.join(' ') ?? '', /🟡|🟠|🔴/);
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

test('wide tables use a mobile-safe stacked layout', async () => {
  const { formatCodeTable } = await import('../utils/formatting.js');
  const output = formatCodeTable(
    [
      { header: '#' },
      { header: 'Team', maxWidth: 28 },
      { header: 'Record' },
      { header: 'PF' },
      { header: 'PA' },
    ],
    [[1, 'A very long fantasy team name that changes', '10-2', '1234.50', '1100.25']],
  );
  assert.doesNotMatch(output, /```/);
  assert.match(output, /\*\*1\. A very long fantasy team/);
  assert.match(output, /\*\*Record:\*\* 10-2/);
  assert.match(output, /\*\*PF:\*\* 1234\.50/);
});

test('wide tables can opt back into the original code-block layout', async () => {
  const { formatCodeTable } = await import('../utils/formatting.js');
  const output = formatCodeTable(
    [
      { header: 'Pick' },
      { header: 'Player', maxWidth: 24 },
      { header: 'Pos' },
      { header: 'NFL' },
      { header: 'Fantasy Team', maxWidth: 24 },
    ],
    [[121, 'Houston Texans', 'DEF', 'HOU', 'A long fantasy team name']],
    { forceCodeBlock: true },
  );
  assert.match(output, /^```/);
  assert.match(output, /Pick\s+Player\s+Pos\s+NFL\s+Fantasy Team/);
});

test('rank and injury helpers use the requested emoji markers', async () => {
  const { formatRank, injuryStatusEmoji } = await import('../utils/formatting.js');
  assert.equal(formatRank(1), '🥇');
  assert.equal(formatRank(2), '🥈');
  assert.equal(formatRank(3), '🥉');
  assert.equal(formatRank(4), '4');
  assert.equal(injuryStatusEmoji('Questionable'), '🟡');
  assert.equal(injuryStatusEmoji('Doubtful'), '🟠');
  assert.equal(injuryStatusEmoji('Out'), '🔴');
  assert.equal(injuryStatusEmoji('IR'), '🔴');
});

test('preseason phase weeks default fantasy commands to week one', async () => {
  configureTestEnvironment();
  const { fantasyWeekFromNflState } = await import('./matchupService.js');
  const baseState = {
    week: 3,
    display_week: 3,
    season: '2026',
    league_season: '2026',
    previous_season: '2025',
  };
  assert.equal(fantasyWeekFromNflState({ ...baseState, season_type: 'pre' }), 1);
  assert.equal(fantasyWeekFromNflState({ ...baseState, season_type: 'regular' }), 3);
});
