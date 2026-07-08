import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as guildLeaguesRepo from '../db/repositories/guildLeaguesRepository';
import { handleLeagueAutocomplete } from './shared';
import { successEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { normalizeNickname } from '../utils/formatting';
import { requireGuild, requireServerOwner } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const removeLeague: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('remove_league')
    .setDescription('Remove a linked Sleeper league from this server (server owner only).')
    .addStringOption((option) =>
      option
        .setName('nickname')
        .setDescription('The nickname of the league to remove')
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

    await guildLeaguesRepo.deleteGuildLeague(league.id);

    // If we removed the default, promote another league (if any) so the
    // server always has a usable default when possible.
    let newDefaultNote = '';
    if (league.is_default) {
      const remaining = await guildLeaguesRepo.getGuildLeagues(guildId);
      if (remaining.length > 0) {
        await guildLeaguesRepo.setDefaultLeague(guildId, remaining[0].id);
        newDefaultNote = `\n**${remaining[0].league_nickname}** is now the default league.`;
      } else {
        newDefaultNote = '\nThis server no longer has a default league.';
      }
    }

    const embed = successEmbed(
      'League removed',
      `**${league.league_name ?? league.league_id}** (\`${league.league_nickname}\`) has been removed from this server.${newDefaultNote}\n\nLinked user accounts were not affected.`,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default removeLeague;
