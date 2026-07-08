import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getLeagueSettings } from '../services/leagueSettingsService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const leagueSettings: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('league_settings')
    .setDescription('Show detailed settings for a linked league.')
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

    const s = await getLeagueSettings(guildLeague.league_id);

    const embed = infoEmbed(`League settings — ${guildLeague.league_nickname}`).addFields(
      { name: 'League name', value: s.name, inline: true },
      { name: 'Season', value: s.season, inline: true },
      { name: 'Status', value: s.status, inline: true },
      { name: 'Total rosters', value: s.totalRosters, inline: true },
      { name: 'Scoring', value: s.scoringType, inline: true },
      { name: 'Waiver type', value: s.waiverType, inline: true },
      { name: 'FAAB budget', value: s.faab, inline: true },
      { name: 'Playoff teams', value: s.playoffTeams, inline: true },
      { name: 'Playoff start week', value: s.playoffWeekStart, inline: true },
      { name: 'Trade deadline (week)', value: s.tradeDeadline, inline: true },
      { name: 'Bench slots', value: s.benchSlots, inline: true },
      { name: 'IR slots', value: s.irSlots, inline: true },
      { name: 'Taxi slots', value: s.taxiSlots, inline: true },
      { name: 'Roster positions', value: truncate(s.rosterPositions, 1024), inline: false },
      { name: 'Draft ID', value: `\`${s.draftId}\``, inline: true },
      { name: 'Previous league ID', value: `\`${s.previousLeagueId}\``, inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default leagueSettings;
