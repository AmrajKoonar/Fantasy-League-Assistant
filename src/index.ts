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
import { handleTradeButton, handleTradeModal } from './interactions/tradeInteractions';
import { errorEmbed } from './utils/embeds';
import { UserFacingError } from './utils/errors';
import { logger } from './utils/logger';
import type { BotCommand } from './types/commands';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let shutdownStarted = false;

const commandMap = new Collection<string, BotCommand>();
for (const command of commands) {
  commandMap.set(command.data.name, command);
}

function isUnknownInteraction(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 10062
  );
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
    if (isUnknownInteraction(err)) {
      logger.warn('Discord rejected an error reply because the interaction had already expired.');
    } else {
      logger.error('Failed to send error reply', err);
    }
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

  // Trade-offer buttons (accept / decline / counter).
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('trade:')) {
      await handleTradeButton(interaction).catch((err) => {
        logger.error('Trade button handler failed', err);
      });
    }
    return;
  }

  // Counteroffer modal submissions.
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('trade:counter_modal:')) {
      await handleTradeModal(interaction).catch((err) => {
        logger.error('Trade modal handler failed', err);
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
    if (isUnknownInteraction(err)) {
      logger.warn(
        `Discord rejected /${interaction.commandName} before it could acknowledge the interaction. Check for duplicate bot processes or a delayed gateway connection.`,
      );
      return;
    }
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

async function shutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;

  logger.info(`Received ${signal}. Shutting down Discord client...`);
  client.destroy();
  logger.info('Discord client shut down cleanly.');
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

logger.info('Starting Fantasy League Assistant...');
logger.info(`NODE_ENV: ${config.nodeEnv}`);
logger.info('Registered command handler.');

client.login(config.discordToken).catch((err) => {
  logger.error('Failed to log in to Discord. Check DISCORD_TOKEN in your .env file.', err);
  process.exit(1);
});
