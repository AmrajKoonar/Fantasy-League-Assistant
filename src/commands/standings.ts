import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getStandings } from '../services/standingsService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatRecord, truncate } from '../utils/formatting';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const MEDALS = ['🥇', '🥈', '🥉'];

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

    const lines = entries.map((entry) => {
      const marker = MEDALS[entry.rank - 1] ?? `**${entry.rank}.**`;
      const record = formatRecord(entry.wins, entry.losses, entry.ties);
      return `${marker} **${entry.teamName}** — ${record} | PF ${formatPoints(entry.pointsFor)} | PA ${formatPoints(entry.pointsAgainst)}`;
    });

    const embed = infoEmbed(
      `Standings — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
      truncate(lines.join('\n'), 4096),
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default standings;
