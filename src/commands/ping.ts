import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { infoEmbed } from '../utils/embeds';
import type { BotCommand } from '../types/commands';

const ping: BotCommand = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check if the bot is online.'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sent = await interaction.reply({
      embeds: [infoEmbed('Pong!', 'Fantasy League Assistant is online.')],
      withResponse: true,
    });
    const latency = sent.resource?.message
      ? sent.resource.message.createdTimestamp - interaction.createdTimestamp
      : null;
    const websocketPing = Math.round(interaction.client.ws.ping);
    const parts = [
      latency !== null ? `Round trip: **${latency}ms**` : null,
      websocketPing >= 0 ? `WebSocket: **${websocketPing}ms**` : null,
    ].filter(Boolean);
    await interaction.editReply({
      embeds: [
        infoEmbed('Pong!', ['Fantasy League Assistant is online.', ...parts].join('\n')),
      ],
    });
  },
};

export default ping;
