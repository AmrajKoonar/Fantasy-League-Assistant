import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getPowerRankings, POWER_FORMULA } from '../services/powerRankingService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatRecord, truncate } from '../utils/formatting';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const powerRankings: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('power_rankings')
    .setDescription('Show bot-calculated power rankings.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname: interaction.options.getString('league'),
    });

    const rankings = await getPowerRankings(guildLeague.league_id);

    const lines = rankings.map((entry) => {
      const record = formatRecord(entry.wins, entry.losses, entry.ties);
      const diff = `${entry.pointDiff >= 0 ? '+' : ''}${formatPoints(entry.pointDiff)}`;
      return `**${entry.rank}.** ${entry.teamName} — ${record} | PF ${formatPoints(entry.pointsFor)} | Diff ${diff} | Power **${entry.powerScore.toFixed(2)}**`;
    });

    const embed = infoEmbed(
      `Power rankings — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
      truncate(lines.join('\n'), 4096),
    ).setFooter({ text: `Bot-calculated (not official). Formula: ${POWER_FORMULA}` });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default powerRankings;
