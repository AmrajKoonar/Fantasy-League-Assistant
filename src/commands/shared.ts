import type { AutocompleteInteraction } from 'discord.js';
import * as guildLeaguesRepo from '../db/repositories/guildLeaguesRepository';
import { logger } from '../utils/logger';

/**
 * Autocomplete handler for the `league` option. Only suggests leagues
 * linked to the current Discord server — never the user's personal
 * Sleeper leagues.
 */
export async function handleLeagueAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  try {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused().toLowerCase();
    const leagues = await guildLeaguesRepo.getGuildLeagues(interaction.guildId);
    const choices = leagues
      .filter((l) => l.league_nickname.includes(focused))
      .slice(0, 25)
      .map((l) => ({
        name: l.is_default ? `${l.league_nickname} (default)` : l.league_nickname,
        value: l.league_nickname,
      }));
    await interaction.respond(choices);
  } catch (err) {
    logger.error('League autocomplete failed', err);
    // Autocomplete failures should never surface as command errors.
    if (!interaction.responded) {
      await interaction.respond([]).catch(() => undefined);
    }
  }
}
