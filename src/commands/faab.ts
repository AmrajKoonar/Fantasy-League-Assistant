import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getFaab } from '../services/managerService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const faab: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('faab')
    .setDescription('Show FAAB (waiver budget) usage for each team.')
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

    const result = await getFaab(guildLeague.league_id);

    const lines = result.entries.map((entry, index) => {
      const remaining = entry.remaining !== null ? ` | Remaining: **$${entry.remaining}**` : '';
      return `**${index + 1}.** ${entry.teamName} — Used: $${entry.used}${remaining}`;
    });

    const budgetNote =
      result.totalBudget !== null
        ? `Total FAAB budget: **$${result.totalBudget}**`
        : 'Total FAAB budget: unknown';
    const faabNote = result.usesFaab
      ? budgetNote
      : 'This league does not appear to use FAAB. Showing waiver budget used anyway.';

    const embed = infoEmbed(
      `FAAB usage — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
      `${faabNote}\n\n${truncate(lines.join('\n'), 3900)}`,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default faab;
