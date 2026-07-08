/**
 * Button and modal handling for Discord-only trade offers.
 *
 * Button custom IDs:  trade:accept:<id> | trade:decline:<id> | trade:counter:<id>
 * Modal custom ID:    trade:counter_modal:<id>
 *
 * Only the manager who received an offer may accept, decline, or counter it.
 * Nothing here is ever sent to Sleeper — trades are a Discord social layer.
 */

import {
  ActionRowBuilder,
  ButtonInteraction,
  Client,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import * as tradeOfferService from '../services/tradeOfferService';
import { errorEmbed, successEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { safeMentionUser } from '../utils/formatting';
import { logger } from '../utils/logger';
import type { TradeOfferRow } from '../types/database';

export const TRADE_BUTTON_PREFIX = 'trade:';

/** Replies with a friendly ephemeral error regardless of interaction state. */
async function replyError(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  title: string,
  description: string,
): Promise<void> {
  const payload = { embeds: [errorEmbed(title, description)] };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    logger.error('Failed to send trade interaction error', err);
  }
}

/** Edits a previously-sent offer message in place (best effort). */
export async function editStoredTradeMessage(client: Client, row: TradeOfferRow): Promise<void> {
  if (!row.channel_id || !row.message_id) return;
  try {
    const channel = await client.channels.fetch(row.channel_id);
    if (!channel || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(row.message_id);
    await message.edit({
      embeds: [tradeOfferService.buildTradeEmbed(row)],
      components: tradeOfferService.buildTradeComponents(row.id, true),
    });
  } catch (err) {
    // Archived/deleted channel or message — non-fatal.
    logger.warn(`Could not edit stored trade message ${row.message_id}`, err);
  }
}

/**
 * Creates a counteroffer from a parent offer, marks the parent as
 * countered, and refreshes the parent's message. Shared by the counter
 * button/modal flow and the /counteroffer command.
 */
export async function applyCounterOffer(options: {
  client: Client;
  parent: TradeOfferRow;
  actorDiscordUserId: string;
  sendText?: string | null;
  receiveText?: string | null;
  note?: string | null;
}): Promise<TradeOfferRow> {
  const insertInput = await tradeOfferService.prepareCounterOffer({
    parent: options.parent,
    actorDiscordUserId: options.actorDiscordUserId,
    overrideSendText: options.sendText,
    overrideReceiveText: options.receiveText,
    note: options.note,
  });
  const newRow = await tradeOfferService.createTradeOffer(insertInput);
  const countered = await tradeOfferService.setStatus(options.parent.id, 'countered');
  await editStoredTradeMessage(options.client, countered);
  return newRow;
}

function parseCustomId(customId: string): { action: string; tradeId: string } | null {
  // trade:<action>:<id>
  const parts = customId.split(':');
  if (parts.length < 3 || parts[0] !== 'trade') return null;
  return { action: parts[1], tradeId: parts.slice(2).join(':') };
}

/** Routes trade button clicks (accept / decline / counter). */
export async function handleTradeButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  const { action, tradeId } = parsed;

  let row: TradeOfferRow | null;
  try {
    row = await tradeOfferService.getTradeOffer(tradeId);
  } catch (err) {
    logger.error('Failed to load trade offer for button', err);
    await replyError(interaction, 'Trade not found', 'I could not load that trade offer.');
    return;
  }
  if (!row) {
    await replyError(interaction, 'Trade not found', 'That trade offer no longer exists.');
    return;
  }

  if (interaction.user.id !== row.to_discord_user_id) {
    await replyError(
      interaction,
      'Not allowed',
      'Only the manager who received this offer can respond to it.',
    );
    return;
  }

  // Counter opens a modal and must respond first (no prior defer).
  if (action === 'counter') {
    if (row.status !== 'pending') {
      await replyError(interaction, 'Cannot counter', `This offer is already **${row.status}**.`);
      return;
    }
    await showCounterModal(interaction, row);
    return;
  }

  if (row.status !== 'pending') {
    await replyError(interaction, 'Already resolved', `This offer is already **${row.status}**.`);
    return;
  }

  try {
    if (action === 'accept') {
      const updated = await tradeOfferService.setStatus(row.id, 'accepted');
      await interaction.update({
        embeds: [tradeOfferService.buildTradeEmbed(updated)],
        components: tradeOfferService.buildTradeComponents(updated.id, true),
      });
      await interaction.followUp({
        content: `${safeMentionUser(updated.from_discord_user_id)} your trade offer was **accepted**! Remember: complete the actual trade in Sleeper.`,
        allowedMentions: { users: [updated.from_discord_user_id] },
      });
    } else if (action === 'decline') {
      const updated = await tradeOfferService.setStatus(row.id, 'declined');
      await interaction.update({
        embeds: [tradeOfferService.buildTradeEmbed(updated)],
        components: tradeOfferService.buildTradeComponents(updated.id, true),
      });
      await interaction.followUp({
        content: `${safeMentionUser(updated.from_discord_user_id)} your trade offer was **declined**.`,
        allowedMentions: { users: [updated.from_discord_user_id] },
      });
    }
  } catch (err) {
    logger.error(`Trade button "${action}" failed`, err);
    await replyError(interaction, 'Something went wrong', 'Please try again in a moment.');
  }
}

async function showCounterModal(
  interaction: ButtonInteraction,
  parent: TradeOfferRow,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`trade:counter_modal:${parent.id}`)
    .setTitle('Counteroffer');

  // Default to the reversed sides (what the target would give / receive).
  const sendInput = new TextInputBuilder()
    .setCustomId('send')
    .setLabel('You give (players and/or FAAB)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(400)
    .setValue(parent.receive_text.slice(0, 400));

  const receiveInput = new TextInputBuilder()
    .setCustomId('receive')
    .setLabel('You receive (players and/or FAAB)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(400)
    .setValue(parent.send_text.slice(0, 400));

  const noteInput = new TextInputBuilder()
    .setCustomId('note')
    .setLabel('Note (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(400);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(sendInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(receiveInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput),
  );

  await interaction.showModal(modal);
}

/** Handles the counteroffer modal submission. */
export async function handleTradeModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.action !== 'counter_modal') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const parent = await tradeOfferService.getTradeOffer(parsed.tradeId);
    if (!parent) {
      await replyError(interaction, 'Trade not found', 'That trade offer no longer exists.');
      return;
    }

    const sendText = interaction.fields.getTextInputValue('send');
    const receiveText = interaction.fields.getTextInputValue('receive');
    const note = interaction.fields.getTextInputValue('note') || null;

    const newRow = await applyCounterOffer({
      client: interaction.client,
      parent,
      actorDiscordUserId: interaction.user.id,
      sendText,
      receiveText,
      note,
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
  } catch (err) {
    if (err instanceof UserFacingError) {
      await replyError(interaction, err.title, err.message);
      return;
    }
    logger.error('Counteroffer modal failed', err);
    await replyError(interaction, 'Something went wrong', 'Please try again in a moment.');
  }
}
