import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
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

    const embed = infoEmbed('Current NFL state').addFields(
      { name: 'Season', value: state.season ?? '—', inline: true },
      { name: 'Season type', value: state.season_type ?? '—', inline: true },
      { name: 'Current week', value: String(state.week ?? '—'), inline: true },
      {
        name: 'Display week',
        value: String(state.display_week ?? state.week ?? '—'),
        inline: true,
      },
      { name: 'League season', value: state.league_season ?? '—', inline: true },
      { name: 'Previous season', value: state.previous_season ?? '—', inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default currentWeek;
