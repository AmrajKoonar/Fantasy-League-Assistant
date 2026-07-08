import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as guildLeaguesRepo from '../db/repositories/guildLeaguesRepository';
import { handleLeagueAutocomplete } from './shared';
import { successEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { normalizeNickname } from '../utils/formatting';
import { requireGuild, requireServerOwner } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const setDefaultLeague: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('set_default_league')
    .setDescription('Set the default Sleeper league for this server (server owner only).')
    .addStringOption((option) =>
      option
        .setName('nickname')
        .setDescription('The nickname of the league to make default')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    requireServerOwner(interaction);
    const guildId = requireGuild(interaction);

    const nickname = normalizeNickname(interaction.options.getString('nickname', true));
    const league = await guildLeaguesRepo.getGuildLeagueByNickname(guildId, nickname);
    if (!league) {
      throw new UserFacingError(
        `${Messages.leagueNotFound}\nUse \`/leagues\` to see the leagues linked to this server.`,
        'League not found',
      );
    }

    await guildLeaguesRepo.setDefaultLeague(guildId, league.id);

    const embed = successEmbed(
      'Default league updated',
      'Commands like `/standings` and `/matchups` will now use this league when no league is specified.',
    ).addFields(
      { name: 'Nickname', value: league.league_nickname, inline: true },
      { name: 'League name', value: league.league_name ?? '—', inline: true },
      { name: 'Season', value: league.season ?? '—', inline: true },
      { name: 'League ID', value: league.league_id, inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default setDefaultLeague;
