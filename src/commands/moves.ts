import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getMoves } from '../services/managerService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatCodeTable } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const moves: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('moves')
    .setDescription('Show total roster moves by team (most active managers).')
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

    const entries = await getMoves(guildLeague.league_id);

    const table = formatCodeTable(
      [
        { header: '#', align: 'right' },
        { header: 'Team', maxWidth: 26 },
        { header: 'Manager', maxWidth: 22 },
        { header: 'Moves', align: 'right' },
      ],
      entries.map((entry, index) => [
        index + 1,
        entry.teamName,
        entry.managerName,
        entry.totalMoves,
      ]),
    );

    const embed = infoEmbed(
      `Most active managers — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
      table,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default moves;
