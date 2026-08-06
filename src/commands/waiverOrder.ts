import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getWaiverOrder } from '../services/managerService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatCodeTable } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const waiverOrder: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('waiver_order')
    .setDescription('Show the waiver priority order for a league.')
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

    const order = await getWaiverOrder(guildLeague.league_id);

    const table = formatCodeTable(
      [
        { header: '#', align: 'right' },
        { header: 'Team', maxWidth: 26 },
        { header: 'Manager', maxWidth: 22 },
        { header: 'Priority', align: 'right' },
      ],
      order.map((entry, index) => [
        index + 1,
        entry.teamName,
        entry.managerName,
        entry.waiverPosition !== null ? `#${entry.waiverPosition}` : 'N/A',
      ]),
    );

    const embed = infoEmbed(
      `Waiver order — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
      order.length > 0 ? table : 'No waiver data available.',
    ).setFooter({
      text: 'Leagues that use FAAB may not rely on waiver priority.',
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default waiverOrder;
