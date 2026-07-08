/**
 * Caches the full Sleeper NFL players database in memory for 24 hours.
 * The players endpoint is very large, so it must never be called per
 * command. All player ID -> name/position lookups go through here.
 */

import * as sleeperApi from './sleeperApi';
import * as cache from './sleeperCache';
import { CacheTtl } from './sleeperCache';
import { UserFacingError } from '../utils/errors';
import { normalizeSearch } from '../utils/formatting';
import { logger } from '../utils/logger';
import type { SleeperPlayer, SleeperPlayersMap } from '../types/sleeper';

const PLAYERS_CACHE_KEY = 'players:nfl';

/** In-flight fetch guard so concurrent commands trigger only one download. */
let inFlight: Promise<SleeperPlayersMap> | null = null;

async function loadPlayers(): Promise<SleeperPlayersMap> {
  const cached = cache.get<SleeperPlayersMap>(PLAYERS_CACHE_KEY);
  if (cached) return cached;

  if (!inFlight) {
    inFlight = (async () => {
      logger.info('Fetching full Sleeper players database (cached for 24h)...');
      const players = await sleeperApi.getPlayers();
      if (!players) {
        throw new UserFacingError(
          'Player data is temporarily unavailable. Please try again in a moment.',
        );
      }
      cache.set(PLAYERS_CACHE_KEY, players, CacheTtl.players);
      logger.info(`Cached ${Object.keys(players).length} Sleeper players.`);
      return players;
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Returns the full players map (from cache when possible). */
export async function getAllPlayers(): Promise<SleeperPlayersMap> {
  return loadPlayers();
}

/** Looks up a single player by Sleeper player ID. */
export async function getPlayerById(playerId: string): Promise<SleeperPlayer | undefined> {
  const players = await loadPlayers();
  return players[playerId];
}

/**
 * Searches cached players by name. Matches against full name, first
 * name, and last name using normalized (lowercase, alphanumeric) text.
 * Results are ranked: exact full-name matches, then prefix matches,
 * then substring matches. Active/rostered players sort above retired ones.
 */
export async function searchPlayersByName(query: string, limit = 5): Promise<SleeperPlayer[]> {
  const players = await loadPlayers();
  const normalized = normalizeSearch(query);
  if (!normalized) return [];

  interface Scored {
    player: SleeperPlayer;
    score: number;
  }
  const results: Scored[] = [];

  for (const player of Object.values(players)) {
    const full = player.search_full_name ?? normalizeSearch(player.full_name ?? '');
    const first = player.search_first_name ?? normalizeSearch(player.first_name ?? '');
    const last = player.search_last_name ?? normalizeSearch(player.last_name ?? '');
    if (!full && !first && !last) continue;

    let score = -1;
    if (full === normalized) score = 100;
    else if (full.startsWith(normalized)) score = 80;
    else if (last === normalized || first === normalized) score = 70;
    else if (full.includes(normalized)) score = 50;
    else if (last.startsWith(normalized) || first.startsWith(normalized)) score = 40;
    if (score < 0) continue;

    // Prefer players currently on an NFL team over free agents/retired.
    if (player.team) score += 10;
    if (player.status === 'Active') score += 5;

    results.push({ player, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => r.player);
}

/** "Josh Allen", falling back to first+last or the player ID. */
export function formatPlayerName(player: SleeperPlayer | undefined, playerId?: string): string {
  if (!player) return playerId ?? 'Unknown player';
  return (
    player.full_name ??
    [player.first_name, player.last_name].filter(Boolean).join(' ') ??
    player.player_id
  );
}
