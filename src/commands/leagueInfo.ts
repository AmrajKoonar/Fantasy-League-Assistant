import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const leagueInfo: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('league_info')
    .setDescription('Show information about a linked Sleeper league.')
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

    const league = await sleeperApi.getLeague(guildLeague.league_id);
    if (!league) {
      throw new UserFacingError(Messages.genericFailure);
    }

    const scoringType =
      league.scoring_settings?.rec === 1
        ? 'PPR'
        : league.scoring_settings?.rec === 0.5
          ? 'Half PPR'
          : league.scoring_settings?.rec === 0 || league.scoring_settings?.rec === undefined
            ? 'Standard'
            : `${league.scoring_settings.rec} per reception`;

    const rosterPositions = league.roster_positions?.length
      ? truncate(league.roster_positions.join(', '), 1024)
      : '—';

    const embed = infoEmbed(`League info — ${guildLeague.league_nickname}`).addFields(
      { name: 'League name', value: league.name ?? '—', inline: true },
      { name: 'Season', value: league.season ?? '—', inline: true },
      { name: 'Status', value: league.status ?? '—', inline: true },
      { name: 'Total rosters', value: String(league.total_rosters ?? '—'), inline: true },
      { name: 'Scoring', value: scoringType, inline: true },
      { name: 'Draft ID', value: league.draft_id ?? '—', inline: true },
      { name: 'Roster positions', value: rosterPositions, inline: false },
      { name: 'League ID', value: `\`${league.league_id}\``, inline: false },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default leagueInfo;
