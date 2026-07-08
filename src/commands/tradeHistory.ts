import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getCurrentNflWeek } from '../services/matchupService';
import { getTrades } from '../services/transactionService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { discordRelativeTime, truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const tradeHistory: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('trade_history')
    .setDescription('Show completed Sleeper trades for a week.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('week')
        .setDescription('NFL week (defaults to the current week)')
        .setMinValue(1)
        .setMaxValue(22)
        .setRequired(false),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname: interaction.options.getString('league'),
    });

    const week = interaction.options.getInteger('week') ?? (await getCurrentNflWeek());
    const trades = await getTrades(guildLeague.league_id, week, 10);
    const title = `Trades — ${guildLeague.league_name ?? guildLeague.league_nickname} (Week ${week})`;

    if (trades.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed(title, `No trades found for week ${week}.`)],
      });
      return;
    }

    const blocks = trades.map((trade) => {
      const header = `🔁 ${trade.status} ${discordRelativeTime(trade.createdAt)}`;
      const sides = trade.sides
        .map((side) => `  **${side.teamName}** gets: ${side.received.join(', ')}`)
        .join('\n');
      return `${header}\n${sides}`;
    });

    const embed = infoEmbed(title, truncate(blocks.join('\n\n'), 4096));
    await interaction.editReply({ embeds: [embed] });
  },
};

export default tradeHistory;
