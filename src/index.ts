import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type Interaction,
} from 'discord.js';
import { config } from './config/env';
import { commands } from './commands';
import { errorEmbed } from './utils/embeds';
import { UserFacingError } from './utils/errors';
import { logger } from './utils/logger';
import type { BotCommand } from './types/commands';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commandMap = new Collection<string, BotCommand>();
for (const command of commands) {
  commandMap.set(command.data.name, command);
}

/** Sends (or edits in) a friendly error embed, whatever state the reply is in. */
async function replyWithError(
  interaction: Interaction,
  title: string,
  description: string,
): Promise<void> {
  if (!interaction.isRepliable()) return;
  const payload = { embeds: [errorEmbed(title, description)] };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    logger.error('Failed to send error reply', err);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  logger.info(`Logged in as ${readyClient.user.tag}`);
  logger.info(`Loaded ${commandMap.size} commands: ${[...commandMap.keys()].join(', ')}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (command?.autocomplete) {
      await command.autocomplete(interaction).catch((err) => {
        logger.error(`Autocomplete failed for /${interaction.commandName}`, err);
      });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) {
    logger.warn(`Received unknown command: /${interaction.commandName}`);
    await replyWithError(interaction, 'Unknown command', 'I do not recognize that command.');
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    if (err instanceof UserFacingError) {
      await replyWithError(interaction, err.title, err.message);
      return;
    }
    logger.error(`Command /${interaction.commandName} failed`, err);
    await replyWithError(
      interaction,
      'Something went wrong',
      'An unexpected error occurred. Please try again in a moment.',
    );
  }
});

client.login(config.discordToken).catch((err) => {
  logger.error('Failed to log in to Discord. Check DISCORD_TOKEN in your .env file.', err);
  process.exit(1);
});
