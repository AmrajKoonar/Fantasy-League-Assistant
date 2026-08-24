import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getCurrentNflWeek } from '../services/matchupService';
import { getWeeklyRecap } from '../services/recapService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { truncate } from '../utils/formatting';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const weeklyRecap: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('weekly_recap')
    .setDescription('Show a fun recap of a fantasy week.')
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
    const recap = await getWeeklyRecap(guildLeague.league_id, week);
    const title = `Weekly recap — ${guildLeague.league_name ?? guildLeague.league_nickname} (Week ${week})`;

    if (!recap.hasScores) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            title,
            `Week ${week} has not been scored yet. Check back once games are underway.`,
          ),
        ],
      });
      return;
    }

    const embed = infoEmbed(title);
    if (recap.highest) {
      embed.addFields({
        name: 'Highest score',
        value: `🔥 ${recap.highest.teamName} — ${formatPoints(recap.highest.points)}`,
        inline: false,
      });
    }
    if (recap.lowest) {
      embed.addFields({
        name: '🧊 Lowest score',
        value: `${recap.lowest.teamName} — ${formatPoints(recap.lowest.points)}`,
        inline: false,
      });
    }
    if (recap.closest) {
      embed.addFields({
        name: '😅 Closest matchup',
        value: `${recap.closest.teamA} vs ${recap.closest.teamB} — margin ${formatPoints(recap.closest.margin)}`,
        inline: false,
      });
    }
    if (recap.blowout) {
      embed.addFields({
        name: '💥 Biggest blowout',
        value: `🏆 ${recap.blowout.winner} over ${recap.blowout.loser} — margin ${formatPoints(recap.blowout.margin)}`,
        inline: false,
      });
    }
    embed.addFields(
      { name: '📊 Average score', value: formatPoints(recap.averageScore), inline: true },
      { name: '✅ Matchups decided', value: String(recap.matchupsDecided), inline: true },
    );
    if (recap.aboveAverage.length > 0) {
      embed.addFields({
        name: 'Above average',
        value: truncate(recap.aboveAverage.join(', '), 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default weeklyRecap;
