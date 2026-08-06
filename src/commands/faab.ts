import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getFaab } from '../services/managerService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatCodeTable } from '../utils/formatting';
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

    const table = formatCodeTable(
      [
        { header: '#', align: 'right' },
        { header: 'Team', maxWidth: 28 },
        { header: 'Used', align: 'right' },
        { header: 'Remaining', align: 'right' },
      ],
      result.entries.map((entry, index) => [
        index + 1,
        entry.teamName,
        `$${entry.used}`,
        entry.remaining !== null ? `$${entry.remaining}` : '—',
      ]),
    );

    const budgetNote =
      result.totalBudget !== null
        ? `Total FAAB budget: **$${result.totalBudget}**`
        : 'Total FAAB budget: unknown';
    const faabNote = result.usesFaab
      ? budgetNote
      : 'This league does not appear to use FAAB. Showing waiver budget used anyway.';

    const embed = infoEmbed(
      `FAAB usage — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
      `${faabNote}\n\n${table}`,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default faab;
