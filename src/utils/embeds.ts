import { EmbedBuilder } from 'discord.js';

const BRAND_NAME = 'Sleeper League Assistant';

const Colors = {
  success: 0x2ecc71,
  error: 0xe74c3c,
  info: 0x3498db,
  warning: 0xf1c40f,
} as const;

function baseEmbed(color: number, title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setFooter({ text: BRAND_NAME })
    .setTimestamp();
  if (description) embed.setDescription(description);
  return embed;
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed(Colors.success, title, description);
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed(Colors.error, title, description);
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed(Colors.info, title, description);
}

export function warningEmbed(title: string, description?: string): EmbedBuilder {
  return baseEmbed(Colors.warning, title, description);
}
