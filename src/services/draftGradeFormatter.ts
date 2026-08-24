import { EmbedBuilder } from 'discord.js';
import { infoEmbed, successEmbed } from '../utils/embeds';
import { formatCodeTable, formatRank, truncate } from '../utils/formatting';
import type { DraftGradesResult, DraftGradeTeamResult } from '../types/draftGrades';

const DRAFT_GRADE_FOOTER =
  'Draft grades use Sleeper roster data, FantasyPros rankings, and AI analysis';

function numbered(lines: string[]): string {
  return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
}

function bulleted(lines: string[]): string {
  return lines.map((line) => `• ${line}`).join('\n');
}

function projectedRecord(team: DraftGradeTeamResult): string {
  if (team.projected_record) return team.projected_record;
  const wins = Math.min(13, Math.max(3, Math.round(3 + ((team.score - 40) / 59) * 10)));
  return `${wins}-${15 - wins}`;
}

export function draftGradeTeamEmbed(
  team: DraftGradeTeamResult,
  leagueName: string,
  _fullDisclaimer = false,
): EmbedBuilder {
  const manager = team.discord_user_id ? `<@${team.discord_user_id}>` : team.manager_name;
  return infoEmbed(
    truncate(`Draft Grade: ${team.team_name}`, 256),
    `Manager: ${truncate(manager, 200)}\nLeague: ${truncate(leagueName, 200)}\nGrade: **${team.grade}**\nScore: **${team.score}/100**\nProjected Final Record: **${projectedRecord(team)}**`,
  )
    .addFields(
      { name: '📈 Strengths', value: numbered(team.strengths), inline: false },
      { name: '📉 Weaknesses', value: numbered(team.weaknesses), inline: false },
      ...(team.advanced_metrics?.length
        ? [{ name: '📊 Advanced Metrics', value: bulleted(team.advanced_metrics), inline: false }]
        : []),
      { name: '📋 Summary', value: team.summary, inline: false },
    )
    .setFooter({ text: DRAFT_GRADE_FOOTER });
}

export function draftGradesIntroEmbed(result: DraftGradesResult): EmbedBuilder {
  const pickNote = result.draft_pick_value_available
    ? ''
    : '\nDraft pick value: unavailable; current rosters were graded instead.';
  const rankingsUpdatedAt = result.rankings_updated_at
    ? new Date(result.rankings_updated_at).getTime()
    : Number.NaN;
  const rankingFreshness = Number.isFinite(rankingsUpdatedAt)
    ? `\nRankings updated: <t:${Math.floor(rankingsUpdatedAt / 1000)}:R>`
    : '';
  return successEmbed(
    'Draft Grades Created',
    `League: ${truncate(result.league_name, 200)}\nTeams graded: ${result.teams.length}\nRanking source: FantasyPros (${result.ranking_type}, ${result.scoring})${rankingFreshness}\nAI analysis: ${result.ai_analysis_used ? 'enabled' : 'fallback metrics used'}\nNote: Grades and 15-game record projections are for fun and may not be perfect.${pickNote}`,
  ).setFooter({ text: DRAFT_GRADE_FOOTER });
}

export function draftGradeEmbeds(result: DraftGradesResult): EmbedBuilder[] {
  return result.teams.map((team) => draftGradeTeamEmbed(team, result.league_name, true));
}

export function projectedPowerRankingsEmbed(result: DraftGradesResult): EmbedBuilder {
  const ranked = [...result.teams].sort(
    (a, b) =>
      (b.projected_wins ?? 0) - (a.projected_wins ?? 0) ||
      b.score - a.score ||
      a.team_name.localeCompare(b.team_name),
  );
  const table = formatCodeTable(
    [
      { header: '#', align: 'right', maxWidth: 2 },
      { header: 'Team', maxWidth: 28 },
      { header: 'Grade' },
      { header: 'Score', align: 'right' },
      { header: 'Record', align: 'right' },
    ],
    ranked.map((team, index) => [
      formatRank(index + 1),
      team.team_name,
      team.grade,
      team.score,
      projectedRecord(team),
    ]),
  );
  return infoEmbed(
    `Projected Power Rankings — ${truncate(result.league_name, 180)}`,
    table,
  ).setFooter({
    text: 'Records cover a hypothetical 15-game fantasy regular season and are for fun, not guarantees.',
  });
}
