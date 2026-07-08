/**
 * Registers slash commands with Discord.
 *
 * With DISCORD_GUILD_ID set (recommended for development), commands are
 * registered to that guild only and update instantly.
 *
 * Run with --global to register commands globally instead (can take up
 * to an hour to propagate): npm run deploy:commands -- --global
 */

import { REST, Routes } from 'discord.js';
import { config } from './config/env';
import { commands } from './commands';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const useGlobal = process.argv.includes('--global');
  const body = commands.map((command) => command.data.toJSON());

  const rest = new REST().setToken(config.discordToken);

  if (useGlobal) {
    logger.info(`Registering ${body.length} global commands...`);
    await rest.put(Routes.applicationCommands(config.discordClientId), { body });
    logger.info('Global commands registered. They can take up to an hour to appear everywhere.');
    return;
  }

  if (!config.discordGuildId) {
    logger.error(
      'DISCORD_GUILD_ID is not set. Set it in .env for guild registration, or pass --global to register commands globally.',
    );
    process.exit(1);
  }

  logger.info(`Registering ${body.length} commands to guild ${config.discordGuildId}...`);
  await rest.put(
    Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
    { body },
  );
  logger.info('Guild commands registered. They should be available immediately.');
}

main().catch((err) => {
  logger.error('Failed to deploy commands', err);
  process.exit(1);
});
