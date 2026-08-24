import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import * as tradeOffersRepo from '../db/repositories/tradeOffersRepository';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { discordRelativeTime, safeMentionUser, truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { TradeOfferStatus } from '../types/database';
import type { BotCommand } from '../types/commands';

const STATUS_EMOJI: Record<TradeOfferStatus, string> = {
  pending: '⏳',
  accepted: '✅',
  declined: '❌',
  countered: '🔁',
  expired: '⌛',
  cancelled: '🚫',
};

const tradeHistoryLocal: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('trade_history_local')
    .setDescription('Show Discord-only trade offers created through the bot.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('Filter by league nickname')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Filter by a manager involved in the offer')
        .setRequired(false),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const providedNickname = interaction.options.getString('league');
    const user = interaction.options.getUser('user');

    let leagueId: string | undefined;
    if (providedNickname) {
      const guildLeague = await resolveLeagueForCommand({
        guildId,
        providedLeagueNickname: providedNickname,
        allowDefault: false,
      });
      leagueId = guildLeague.league_id;
    }

    const offers = await tradeOffersRepo.listTradeOffers({
      guildId,
      leagueId,
      discordUserId: user?.id,
      limit: 10,
    });

    if (offers.length === 0) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            '🔁 Discord trade offers',
            'No Discord-only trade offers found for those filters. Create one with `/trade`.',
          ),
        ],
      });
      return;
    }

    const blocks = offers.map((offer) => {
      const emoji = STATUS_EMOJI[offer.status] ?? '•';
      const when = discordRelativeTime(new Date(offer.created_at).getTime());
      return [
        `${emoji} **${offer.status}** — ${offer.league_nickname} ${when}`,
        `  ${safeMentionUser(offer.from_discord_user_id)} → ${safeMentionUser(offer.to_discord_user_id)}`,
        `  Gives: ${offer.send_text}`,
        `  Wants: ${offer.receive_text}`,
      ].join('\n');
    });

    const embed = infoEmbed(
      '🔁 Discord trade offers',
      truncate(blocks.join('\n\n'), 4096),
    ).setFooter({
      text: 'Discord-only proposals. Trades are completed manually in Sleeper.',
    });

    await interaction.editReply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};

export default tradeHistoryLocal;
