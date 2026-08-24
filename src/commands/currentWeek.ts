import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import { fantasyWeekFromNflState } from '../services/matchupService';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import type { BotCommand } from '../types/commands';

const currentWeek: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('current_week')
    .setDescription('Show the current NFL/Sleeper state (season, week).'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const state = await sleeperApi.getNflState();
    if (!state) throw new UserFacingError(Messages.genericFailure);
    const fantasyWeek = fantasyWeekFromNflState(state);
    const sleeperPhaseWeek = state.display_week ?? state.week;
    const seasonType = state.season_type?.toLowerCase() === 'pre' ? 'Preseason' : state.season_type;

    const embed = infoEmbed('Current NFL state').addFields(
      { name: 'Season', value: state.season ?? '—', inline: true },
      { name: 'Season type', value: seasonType ?? '—', inline: true },
      { name: 'Fantasy week', value: String(fantasyWeek), inline: true },
      {
        name: 'Sleeper phase week',
        value: String(sleeperPhaseWeek ?? '—'),
        inline: true,
      },
      { name: 'League season', value: state.league_season ?? '—', inline: true },
      { name: 'Previous season', value: state.previous_season ?? '—', inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default currentWeek;
