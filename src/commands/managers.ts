import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getManagers } from '../services/managerService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const managers: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('managers')
    .setDescription('Show all managers in a linked league.')
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

    const managerList = await getManagers(guildLeague.league_id);
    if (managerList.length === 0) {
      throw new UserFacingError('This league does not have any managers yet.', 'No managers');
    }

    const lines = managerList.map((m) => {
      const commish = m.isCommissioner ? ' 👑' : '';
      const username = m.sleeperUsername ? ` (@${m.sleeperUsername})` : '';
      const rosterTag = m.rosterId !== null ? `#${m.rosterId}` : 'no roster';
      return `**${m.teamName}**${commish}\n${m.managerName}${username} — ${rosterTag}`;
    });

    const embed = infoEmbed(
      `Managers — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
      truncate(lines.join('\n\n'), 4096),
    ).setFooter({ text: '👑 = commissioner' });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default managers;
