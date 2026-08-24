import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getStandings } from '../services/standingsService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatCodeTable, formatRank, formatRecord } from '../utils/formatting';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const standings: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('standings')
    .setDescription('Show league standings.')
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

    const entries = await getStandings(guildLeague.league_id);
    const highestPointsFor = Math.max(0, ...entries.map((entry) => entry.pointsFor));

    const table = formatCodeTable(
      [
        { header: '#', align: 'right' },
        { header: 'Team', maxWidth: 28 },
        { header: 'Record', align: 'right' },
        { header: 'PF', align: 'right' },
        { header: 'PA', align: 'right' },
      ],
      entries.map((entry) => [
        formatRank(entry.rank),
        `${highestPointsFor > 0 && entry.pointsFor === highestPointsFor ? '🔥 ' : ''}${entry.teamName}`,
        formatRecord(entry.wins, entry.losses, entry.ties),
        formatPoints(entry.pointsFor),
        formatPoints(entry.pointsAgainst),
      ]),
    );

    const embed = infoEmbed(
      `Standings — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
      table,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default standings;
