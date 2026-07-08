import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getCurrentNflWeek } from '../services/matchupService';
import { getBenchwarmer } from '../services/recapService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const benchwarmer: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('benchwarmer')
    .setDescription('Show the highest bench score of a week.')
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
    const result = await getBenchwarmer(guildLeague.league_id, week);
    const title = `Benchwarmer of the week — ${guildLeague.league_nickname} (Week ${week})`;

    if (!result) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            title,
            'Sleeper did not return enough player scoring data to calculate this reliably (the week may not have started).',
          ),
        ],
      });
      return;
    }

    const topPlayer = result.topBenchPlayer
      ? `\nTop bench player: **${result.topBenchPlayer}** (${formatPoints(result.topBenchPoints)})`
      : '';
    const embed = infoEmbed(
      title,
      `🪑 **${result.teamName}** left the most on the bench: **${formatPoints(result.benchPoints)}** points.${topPlayer}`,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default benchwarmer;
