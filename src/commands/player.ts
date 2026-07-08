import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as playerCache from '../services/playerCache';
import { infoEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import type { BotCommand } from '../types/commands';

const player: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Search the Sleeper player database by name.')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Player name to search for')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const query = interaction.options.getString('name', true).trim();
    const matches = await playerCache.searchPlayersByName(query, 5);

    if (matches.length === 0) {
      throw new UserFacingError(
        `No players found matching \`${query}\`. Try a different spelling or a shorter name.`,
        'No players found',
      );
    }

    const embed = infoEmbed(`Player search — "${query}"`);

    for (const match of matches) {
      const name = playerCache.formatPlayerName(match);
      const details = [
        `Position: ${match.position ?? '—'}`,
        `Team: ${match.team ?? 'Free agent'}`,
        `Age: ${match.age ?? '—'}`,
        `Fantasy positions: ${match.fantasy_positions?.join(', ') ?? '—'}`,
        match.injury_status ? `Injury: ${match.injury_status}` : null,
        `Sleeper ID: \`${match.player_id}\``,
      ]
        .filter(Boolean)
        .join('\n');

      embed.addFields({ name, value: details, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default player;
