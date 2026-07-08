import type { ChatInputCommandInteraction } from 'discord.js';
import { Messages, UserFacingError } from './errors';

/**
 * Throws a friendly error unless the interaction comes from the Discord
 * server owner. Used by league management commands.
 */
export function requireServerOwner(interaction: ChatInputCommandInteraction): void {
  if (!interaction.guild) {
    throw new UserFacingError(Messages.guildOnly, 'Server only');
  }
  if (interaction.user.id !== interaction.guild.ownerId) {
    throw new UserFacingError(Messages.ownerOnly, 'Permission denied');
  }
}

/** Throws a friendly error if the command was used outside a guild. */
export function requireGuild(interaction: ChatInputCommandInteraction): string {
  if (!interaction.guildId) {
    throw new UserFacingError(Messages.guildOnly, 'Server only');
  }
  return interaction.guildId;
}
