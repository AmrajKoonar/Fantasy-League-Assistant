import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as tradeOfferService from '../services/tradeOfferService';
import { applyCounterOffer } from '../interactions/tradeInteractions';
import { successEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { safeMentionUser } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const counteroffer: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('counteroffer')
    .setDescription('Counter an existing trade offer.')
    .addStringOption((option) =>
      option
        .setName('trade_id')
        .setDescription('The Trade ID from the original offer')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('send')
        .setDescription('What you give (defaults to the reversed original offer)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('receive')
        .setDescription('What you want back (defaults to the reversed original offer)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('note').setDescription('Optional note to include').setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    requireGuild(interaction);

    const tradeId = interaction.options.getString('trade_id', true).trim();
    const parent = await tradeOfferService.getTradeOffer(tradeId);
    if (!parent) {
      throw new UserFacingError(
        'I could not find a trade offer with that Trade ID.',
        'Trade not found',
      );
    }

    const newRow = await applyCounterOffer({
      client: interaction.client,
      parent,
      actorDiscordUserId: interaction.user.id,
      sendText: interaction.options.getString('send'),
      receiveText: interaction.options.getString('receive'),
      note: interaction.options.getString('note'),
    });

    const message = await interaction.followUp({
      content: safeMentionUser(newRow.to_discord_user_id),
      embeds: [tradeOfferService.buildTradeEmbed(newRow)],
      components: tradeOfferService.buildTradeComponents(newRow.id),
      allowedMentions: { users: [newRow.to_discord_user_id] },
    });
    await tradeOfferService.attachMessage(newRow.id, message.channelId, message.id);

    await interaction.editReply({
      embeds: [successEmbed('Counteroffer sent', 'Your counteroffer has been posted.')],
    });
  },
};

export default counteroffer;
