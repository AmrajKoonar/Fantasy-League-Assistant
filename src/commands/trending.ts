import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import * as playerCache from '../services/playerCache';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { formatCodeTable } from '../utils/formatting';
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
        .setDescription('Trending adds or drops (defaults to adds)')
        .setRequired(false)
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

    const type = (interaction.options.getString('type') ?? 'add') as TrendingType;
    const hours = interaction.options.getInteger('hours') ?? 24;
    const limit = Math.min(interaction.options.getInteger('limit') ?? 10, MAX_LIMIT);

    const trendingPlayers = await sleeperApi.getTrendingPlayers(type, hours, limit);
    if (!trendingPlayers) {
      throw new UserFacingError(Messages.genericFailure);
    }

    const players = await playerCache.getAllPlayers();

    const rows = trendingPlayers.map((entry, index) => {
      const player = players[entry.player_id];
      const name = playerCache.formatPlayerName(player, entry.player_id);
      const position = player?.position ?? player?.fantasy_positions?.[0] ?? '?';
      const team = player?.team ?? 'FA';
      const count = entry.count?.toLocaleString() ?? '—';
      return [index + 1, name, position, team, count];
    });
    const table = formatCodeTable(
      [
        { header: '#', align: 'right' },
        { header: 'Player', maxWidth: 28 },
        { header: 'Pos' },
        { header: 'Team' },
        { header: type === 'add' ? '➕ Adds' : '➖ Drops', align: 'right' },
      ],
      rows,
      { forceCodeBlock: true },
    );

    const verb = type === 'add' ? 'added' : 'dropped';
    const embed = infoEmbed(
      `Trending ${verb} players (last ${hours}h)`,
      rows.length > 0 ? table : 'No trending players found.',
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default trending;
