import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as guildLeaguesRepo from '../db/repositories/guildLeaguesRepository';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const leagues: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('leagues')
    .setDescription('List all Sleeper leagues linked to this server.'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const guildLeagues = await guildLeaguesRepo.getGuildLeagues(guildId);

    if (guildLeagues.length === 0) {
      throw new UserFacingError(Messages.noLeagues, 'No linked leagues');
    }

    const embed = infoEmbed(
      `Linked leagues — ${interaction.guild?.name ?? 'this server'}`,
      'Use the nickname with commands, e.g. `/standings league:<nickname>`.',
    );

    for (const league of guildLeagues.slice(0, 25)) {
      embed.addFields({
        name: `${league.is_default ? '⭐ ' : ''}${league.league_nickname}`,
        value: [
          `**${league.league_name ?? 'Unknown league'}**`,
          `Season: ${league.season ?? '—'}`,
          `League ID: \`${league.league_id}\``,
        ].join('\n'),
        inline: true,
      });
    }

    if (guildLeagues.some((l) => l.is_default)) {
      embed.setDescription(
        `${embed.data.description}\n⭐ = default league used when no league is specified.`,
      );
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default leagues;
