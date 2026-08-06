import { EmbedBuilder } from 'discord.js';
import { infoEmbed, successEmbed } from '../utils/embeds';
import { truncate } from '../utils/formatting';
import type { DraftGradesResult, DraftGradeTeamResult } from '../types/draftGrades';

const LEAGUE_FOOTER =
  'Draft grades use Sleeper roster data, FantasyPros rankings, and AI analysis. These grades are for fun and may not be perfect.';
const TEAM_FOOTER = 'Generated using Sleeper data, FantasyPros rankings, and AI analysis.';

function numbered(lines: string[]): string {
  return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
}

export function draftGradeTeamEmbed(
  team: DraftGradeTeamResult,
  leagueName: string,
  fullDisclaimer = false,
): EmbedBuilder {
  const manager = team.discord_user_id ? `<@${team.discord_user_id}>` : team.manager_name;
  return infoEmbed(
    truncate(`Draft Grade: ${team.team_name}`, 256),
    `Manager: ${truncate(manager, 200)}\nLeague: ${truncate(leagueName, 200)}\nGrade: **${team.grade}**\nScore: **${team.score}/100**`,
  )
    .addFields(
      { name: 'Strengths', value: numbered(team.strengths), inline: false },
      { name: 'Weaknesses', value: numbered(team.weaknesses), inline: false },
      { name: 'Summary', value: team.summary, inline: false },
    )
    .setFooter({ text: fullDisclaimer ? LEAGUE_FOOTER : TEAM_FOOTER });
}

export function draftGradesIntroEmbed(result: DraftGradesResult): EmbedBuilder {
  const pickNote = result.draft_pick_value_available
    ? ''
    : '\nDraft pick value: unavailable; current rosters were graded instead.';
  return successEmbed(
    'Draft Grades Created',
    `League: ${truncate(result.league_name, 200)}\nTeams graded: ${result.teams.length}\nRanking source: FantasyPros (${result.ranking_type}, ${result.scoring})\nAI analysis: ${result.ai_analysis_used ? 'enabled' : 'fallback metrics used'}\nNote: These are for fun and may not be perfect.${pickNote}`,
  ).setFooter({ text: LEAGUE_FOOTER });
}

export function draftGradeEmbeds(result: DraftGradesResult): EmbedBuilder[] {
  return result.teams.map((team) => draftGradeTeamEmbed(team, result.league_name, true));
}
