import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getCurrentNflWeek } from '../services/matchupService';
import { getClosestMatchup } from '../services/recapService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const closestMatchup: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('closest_matchup')
    .setDescription('Show the closest matchup of a week.')
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
    const result = await getClosestMatchup(guildLeague.league_id, week);
    const title = `Closest matchup — ${guildLeague.league_nickname} (Week ${week})`;

    if (!result) {
      await interaction.editReply({
        embeds: [infoEmbed(title, `No completed matchups to compare for week ${week} yet.`)],
      });
      return;
    }

    const nailBiter = result.margin <= 5 ? '\n😰 What a nail-biter!' : '';
    const embed = infoEmbed(
      title,
      `**${result.teamA}** ${formatPoints(result.pointsA)} — ${formatPoints(result.pointsB)} **${result.teamB}**\nMargin: **${formatPoints(result.margin)}**${nailBiter}`,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default closestMatchup;
