import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getCurrentNflWeek } from '../services/matchupService';
import { getWaiverActivity } from '../services/transactionService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { discordRelativeTime, truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const waiverHistory: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('waiver_history')
    .setDescription('Show recent waiver and free-agent activity for a week.')
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
    const activity = await getWaiverActivity(guildLeague.league_id, week, 10);
    const title = `Waiver activity — ${guildLeague.league_name ?? guildLeague.league_nickname} (Week ${week})`;

    if (activity.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed(title, `No waiver or free-agent moves found for week ${week}.`)],
      });
      return;
    }

    const blocks = activity.map((entry) => {
      const label = entry.type === 'waiver' ? '📥 Waiver' : '🆓 Free agent';
      const lines = [
        `${label} — ${entry.teamName} (${entry.status}) ${discordRelativeTime(entry.createdAt)}`,
      ];
      if (entry.added.length > 0) lines.push(`  ➕ ${entry.added.join(', ')}`);
      if (entry.dropped.length > 0) lines.push(`  ➖ ${entry.dropped.join(', ')}`);
      if (entry.faab !== null && entry.faab > 0) lines.push(`  💰 $${entry.faab} FAAB`);
      return lines.join('\n');
    });

    const embed = infoEmbed(title, truncate(blocks.join('\n\n'), 4096));
    await interaction.editReply({ embeds: [embed] });
  },
};

export default waiverHistory;
