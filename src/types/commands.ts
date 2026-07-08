import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

export type CommandData =
  SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;

/** Shape every file in src/commands must export. */
export interface BotCommand {
  data: CommandData;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}
