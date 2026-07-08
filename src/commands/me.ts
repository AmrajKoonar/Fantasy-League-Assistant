import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as linkedUsersRepo from '../db/repositories/linkedUsersRepository';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import type { BotCommand } from '../types/commands';

const me: BotCommand = {
  data: new SlashCommandBuilder().setName('me').setDescription('Show your linked Sleeper account.'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const linked = await linkedUsersRepo.getLinkedUser(interaction.user.id);
    if (!linked) {
      throw new UserFacingError(Messages.notLinked, 'No linked account');
    }

    const embed = infoEmbed('Your linked Sleeper account').addFields(
      { name: 'Display name', value: linked.sleeper_display_name ?? '—', inline: true },
      { name: 'Username', value: linked.sleeper_username ?? '—', inline: true },
      { name: 'Sleeper user ID', value: linked.sleeper_user_id, inline: true },
    );

    if (linked.sleeper_avatar) {
      embed.setThumbnail(`https://sleepercdn.com/avatars/thumbs/${linked.sleeper_avatar}`);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default me;
