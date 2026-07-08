import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import {
  findSharedLeaguesBetweenUsers,
  resolveLeagueForCommand,
  resolveUserLinkedAccount,
} from '../services/leagueResolver';
import { findRosterForSleeperUser } from '../services/rosterService';
import * as playerCache from '../services/playerCache';
import * as tradeOfferService from '../services/tradeOfferService';
import { handleLeagueAutocomplete } from './shared';
import { successEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { safeMentionUser } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { GuildLeagueRow } from '../types/database';
import type { SleeperRoster } from '../types/sleeper';
import type { BotCommand } from '../types/commands';

const trade: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Propose a Discord-only trade offer to another manager.')
    .addUserOption((option) =>
      option.setName('user').setDescription('The manager you want to trade with').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('send')
        .setDescription('What you give (players and/or FAAB, e.g. "Justin Jefferson + $10 FAAB")')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('receive')
        .setDescription('What you want back (players and/or FAAB)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (auto-detected from a shared league if omitted)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('note')
        .setDescription('Optional note to include with the offer')
        .setRequired(false),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = requireGuild(interaction);
    const targetUser = interaction.options.getUser('user', true);

    if (targetUser.id === interaction.user.id) {
      throw new UserFacingError('You cannot trade with yourself.', 'Invalid trade');
    }
    if (targetUser.bot) {
      throw new UserFacingError('You cannot trade with a bot.', 'Invalid trade');
    }

    const sender = await resolveUserLinkedAccount({
      discordUserId: interaction.user.id,
      isSelf: true,
      username: interaction.user.username,
    });
    const target = await resolveUserLinkedAccount({
      discordUserId: targetUser.id,
      isSelf: false,
      username: targetUser.username,
    });

    const sendText = interaction.options.getString('send', true);
    const receiveText = interaction.options.getString('receive', true);
    const note = interaction.options.getString('note');

    // Resolve which linked league both managers share.
    const providedNickname = interaction.options.getString('league');
    let guildLeague: GuildLeagueRow;
    let fromRoster: SleeperRoster;
    let toRoster: SleeperRoster;

    if (providedNickname) {
      guildLeague = await resolveLeagueForCommand({
        guildId,
        providedLeagueNickname: providedNickname,
        allowDefault: false,
      });
      const [fr, tr] = await Promise.all([
        findRosterForSleeperUser(guildLeague.league_id, sender.sleeper_user_id),
        findRosterForSleeperUser(guildLeague.league_id, target.sleeper_user_id),
      ]);
      if (!fr) {
        throw new UserFacingError(
          `You are not in the **${guildLeague.league_nickname}** league.`,
          'Not in league',
        );
      }
      if (!tr) {
        throw new UserFacingError(
          `**${targetUser.username}** is not in the **${guildLeague.league_nickname}** league.`,
          'Not in league',
        );
      }
      fromRoster = fr;
      toRoster = tr;
    } else {
      const shared = await findSharedLeaguesBetweenUsers({
        guildId,
        sleeperUserIdA: sender.sleeper_user_id,
        sleeperUserIdB: target.sleeper_user_id,
      });
      if (shared.length === 0) {
        throw new UserFacingError(
          `You and **${targetUser.username}** do not share a linked league on this server.`,
          'No shared league',
        );
      }
      if (shared.length > 1) {
        const options = shared
          .map((s) => `\`/trade league:${s.league.league_nickname} ...\``)
          .join('\n');
        throw new UserFacingError(
          `You share multiple leagues with **${targetUser.username}**. Please specify one:\n${options}`,
          'Multiple shared leagues',
        );
      }
      guildLeague = shared[0].league;
      fromRoster = shared[0].rosterA;
      toRoster = shared[0].rosterB;
    }

    const players = await playerCache.getAllPlayers();
    const validated = tradeOfferService.validateTrade({
      sendText,
      receiveText,
      fromRoster,
      toRoster,
      players,
      fromLabel: 'your',
      toLabel: targetUser.username,
    });

    const row = await tradeOfferService.createTradeOffer({
      guild_id: guildId,
      channel_id: null,
      message_id: null,
      league_id: guildLeague.league_id,
      league_nickname: guildLeague.league_nickname,
      from_discord_user_id: interaction.user.id,
      to_discord_user_id: targetUser.id,
      from_sleeper_user_id: sender.sleeper_user_id,
      to_sleeper_user_id: target.sleeper_user_id,
      from_roster_id: fromRoster.roster_id,
      to_roster_id: toRoster.roster_id,
      send_text: sendText,
      receive_text: receiveText,
      parsed_send: validated.parsedSend,
      parsed_receive: validated.parsedReceive,
      status: 'pending',
      note: note?.trim() || null,
      parent_trade_offer_id: null,
    });

    // Public offer message that pings the target manager.
    const message = await interaction.followUp({
      content: safeMentionUser(targetUser.id),
      embeds: [tradeOfferService.buildTradeEmbed(row)],
      components: tradeOfferService.buildTradeComponents(row.id),
      allowedMentions: { users: [targetUser.id] },
    });
    await tradeOfferService.attachMessage(row.id, message.channelId, message.id);

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Trade offer sent',
          `Your offer to **${targetUser.username}** has been posted.`,
        ),
      ],
    });
  },
};

export default trade;
