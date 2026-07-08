import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import * as linkedUsersRepo from '../db/repositories/linkedUsersRepository';
import { successEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import type { BotCommand } from '../types/commands';

const linkSleeper: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('link_sleeper')
    .setDescription('Link your Discord account to your Sleeper account.')
    .addStringOption((option) =>
      option.setName('username').setDescription('Your Sleeper username').setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const username = interaction.options.getString('username', true).trim();
    const sleeperUser = await sleeperApi.getUserByUsername(username);

    if (!sleeperUser) {
      throw new UserFacingError(
        `${Messages.sleeperUserNotFound}\nDouble-check the spelling of \`${username}\` and try again.`,
        'Sleeper user not found',
      );
    }

    await linkedUsersRepo.upsertLinkedUser({
      discord_user_id: interaction.user.id,
      discord_username: interaction.user.username,
      sleeper_user_id: sleeperUser.user_id,
      sleeper_username: sleeperUser.username,
      sleeper_display_name: sleeperUser.display_name,
      sleeper_avatar: sleeperUser.avatar,
    });

    const embed = successEmbed(
      'Sleeper account linked',
      'Your Discord account is now linked to this Sleeper account. You can use commands like `/roster` and it will find your teams automatically.',
    ).addFields(
      { name: 'Display name', value: sleeperUser.display_name || '—', inline: true },
      { name: 'Username', value: sleeperUser.username || '—', inline: true },
      { name: 'Sleeper user ID', value: sleeperUser.user_id, inline: true },
    );

    if (sleeperUser.avatar) {
      embed.setThumbnail(`https://sleepercdn.com/avatars/thumbs/${sleeperUser.avatar}`);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default linkSleeper;
