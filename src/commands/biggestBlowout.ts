import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getCurrentNflWeek } from '../services/matchupService';
import { getBiggestBlowout } from '../services/recapService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const biggestBlowout: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('biggest_blowout')
    .setDescription('Show the largest win margin of a week.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('week')
        .setDescription('NFL week (defaults to the current week)')
        .setMinValue(1)
        .setMaxValue(22)
        .setRequired(false),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname: interaction.options.getString('league'),
    });

    const week = interaction.options.getInteger('week') ?? (await getCurrentNflWeek());
    const result = await getBiggestBlowout(guildLeague.league_id, week);
    const title = `Biggest blowout — ${guildLeague.league_nickname} (Week ${week})`;

    if (!result || result.margin === 0) {
      await interaction.editReply({
        embeds: [infoEmbed(title, `No completed matchups to compare for week ${week} yet.`)],
      });
      return;
    }

    const embed = infoEmbed(
      title,
      `💥 **${result.winner}** demolished **${result.loser}**\n${formatPoints(result.winnerPoints)} — ${formatPoints(result.loserPoints)}\nMargin: **${formatPoints(result.margin)}**`,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default biggestBlowout;
