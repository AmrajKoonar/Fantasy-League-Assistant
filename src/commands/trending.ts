import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import * as playerCache from '../services/playerCache';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { truncate } from '../utils/formatting';
import type { TrendingType } from '../types/sleeper';
import type { BotCommand } from '../types/commands';

const MAX_LIMIT = 25;

const trending: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('trending')
    .setDescription('Show trending added or dropped players across Sleeper.')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Trending adds or drops')
        .setRequired(true)
        .addChoices({ name: 'add', value: 'add' }, { name: 'drop', value: 'drop' }),
    )
    .addIntegerOption((option) =>
      option
        .setName('hours')
        .setDescription('Lookback window in hours (default 24)')
        .setMinValue(1)
        .setMaxValue(168)
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription(`Number of players to show (default 10, max ${MAX_LIMIT})`)
        .setMinValue(1)
        .setMaxValue(MAX_LIMIT)
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const type = interaction.options.getString('type', true) as TrendingType;
    const hours = interaction.options.getInteger('hours') ?? 24;
    const limit = Math.min(interaction.options.getInteger('limit') ?? 10, MAX_LIMIT);

    const trendingPlayers = await sleeperApi.getTrendingPlayers(type, hours, limit);
    if (!trendingPlayers) {
      throw new UserFacingError(Messages.genericFailure);
    }

    const players = await playerCache.getAllPlayers();

    const lines = trendingPlayers.map((entry, index) => {
      const player = players[entry.player_id];
      const name = playerCache.formatPlayerName(player, entry.player_id);
      const position = player?.position ?? player?.fantasy_positions?.[0] ?? '?';
      const team = player?.team ?? 'FA';
      const count = entry.count?.toLocaleString() ?? '—';
      return `**${index + 1}.** ${name} (${position} - ${team}) — ${count} ${type === 'add' ? 'adds' : 'drops'}`;
    });

    const verb = type === 'add' ? 'added' : 'dropped';
    const embed = infoEmbed(
      `Trending ${verb} players (last ${hours}h)`,
      lines.length > 0 ? truncate(lines.join('\n'), 4096) : 'No trending players found.',
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default trending;
