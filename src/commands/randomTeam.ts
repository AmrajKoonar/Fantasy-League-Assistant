import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { pickRandomTeam } from '../services/funService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const randomTeam: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('random_team')
    .setDescription('Randomly pick a team from a linked league.')
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

    const team = await pickRandomTeam(guildLeague.league_id);
    if (!team) {
      throw new UserFacingError('This league has no teams to pick from.', 'No teams');
    }

    const embed = infoEmbed(
      '🎲 Random team',
      `Randomly selected: **${team.teamName}** (${team.managerName}).\nThe bot has spoken.`,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default randomTeam;
