import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getLeagueRecords } from '../services/powerRankingService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const leagueRecords: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('league_records')
    .setDescription('Show fun league records and extremes.')
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

    const records = await getLeagueRecords(guildLeague.league_id);
    if (records.length === 0) {
      throw new UserFacingError('No league records available yet.', 'No records');
    }

    const embed = infoEmbed(
      `League records — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
    );
    for (const record of records) {
      embed.addFields({
        name: record.label,
        value: `${record.teamName} — ${record.value}`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default leagueRecords;
