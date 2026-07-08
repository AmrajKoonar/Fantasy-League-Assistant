/**
 * Centralized client for the official Sleeper API (https://docs.sleeper.com/).
 * The API is free, read-only, and requires no token. All Sleeper fetch
 * calls in the codebase go through this file, with caching applied so
 * repeated Discord commands do not spam the API (limit: 1000 calls/min).
 */

import { SleeperApiError } from '../utils/errors';
import { logger } from '../utils/logger';
import * as cache from './sleeperCache';
import { CacheTtl } from './sleeperCache';
import type {
  SleeperBracketMatchup,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayersMap,
  SleeperRoster,
  SleeperTradedPick,
  SleeperTransaction,
  SleeperTrendingPlayer,
  SleeperUser,
  TrendingType,
} from '../types/sleeper';

const BASE_URL = 'https://api.sleeper.app/v1';

/**
 * Performs a GET request against the Sleeper API.
 * Returns null on 404 (Sleeper's "not found"), throws SleeperApiError
 * on any other non-OK status.
 */
async function sleeperGet<T>(path: string): Promise<T | null> {
  const url = `${BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    logger.error(`Sleeper API network error for ${path}`, err);
    throw new SleeperApiError(path, 0, `Network error calling Sleeper API: ${path}`);
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    logger.error(`Sleeper API error: ${path} responded with ${response.status}`);
    throw new SleeperApiError(path, response.status);
  }
  return (await response.json()) as T;
}

export async function getUserByUsername(username: string): Promise<SleeperUser | null> {
  return sleeperGet<SleeperUser>(`/user/${encodeURIComponent(username)}`);
}

export async function getUserById(userId: string): Promise<SleeperUser | null> {
  return sleeperGet<SleeperUser>(`/user/${encodeURIComponent(userId)}`);
}

export async function getUserLeagues(
  userId: string,
  season: string,
): Promise<SleeperLeague[] | null> {
  return cache.getOrSet(`userLeagues:${userId}:${season}`, CacheTtl.userLeagues, () =>
    sleeperGet<SleeperLeague[]>(
      `/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`,
    ),
  );
}

export async function getLeague(leagueId: string): Promise<SleeperLeague | null> {
  return cache.getOrSet(`league:${leagueId}`, CacheTtl.leagueInfo, () =>
    sleeperGet<SleeperLeague>(`/league/${encodeURIComponent(leagueId)}`),
  );
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[] | null> {
  return cache.getOrSet(`rosters:${leagueId}`, CacheTtl.rosters, () =>
    sleeperGet<SleeperRoster[]>(`/league/${encodeURIComponent(leagueId)}/rosters`),
  );
}

export async function getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[] | null> {
  return cache.getOrSet(`leagueUsers:${leagueId}`, CacheTtl.leagueUsers, () =>
    sleeperGet<SleeperLeagueUser[]>(`/league/${encodeURIComponent(leagueId)}/users`),
  );
}

export async function getLeagueMatchups(
  leagueId: string,
  week: number,
): Promise<SleeperMatchup[] | null> {
  return cache.getOrSet(`matchups:${leagueId}:${week}`, CacheTtl.matchups, () =>
    sleeperGet<SleeperMatchup[]>(`/league/${encodeURIComponent(leagueId)}/matchups/${week}`),
  );
}

export async function getNflState(): Promise<SleeperNflState | null> {
  return cache.getOrSet('nflState', CacheTtl.nflState, () =>
    sleeperGet<SleeperNflState>('/state/nfl'),
  );
}

export async function getTransactions(
  leagueId: string,
  round: number,
): Promise<SleeperTransaction[] | null> {
  return cache.getOrSet(`transactions:${leagueId}:${round}`, CacheTtl.transactions, () =>
    sleeperGet<SleeperTransaction[]>(
      `/league/${encodeURIComponent(leagueId)}/transactions/${round}`,
    ),
  );
}

/**
 * Fetches the full NFL players map (~5MB). Callers should go through
 * playerCache.ts, which keeps this cached for 24 hours.
 */
export async function getPlayers(): Promise<SleeperPlayersMap | null> {
  return sleeperGet<SleeperPlayersMap>('/players/nfl');
}

export async function getWinnersBracket(leagueId: string): Promise<SleeperBracketMatchup[] | null> {
  return cache.getOrSet(`winnersBracket:${leagueId}`, CacheTtl.bracket, () =>
    sleeperGet<SleeperBracketMatchup[]>(`/league/${encodeURIComponent(leagueId)}/winners_bracket`),
  );
}

export async function getLosersBracket(leagueId: string): Promise<SleeperBracketMatchup[] | null> {
  return cache.getOrSet(`losersBracket:${leagueId}`, CacheTtl.bracket, () =>
    sleeperGet<SleeperBracketMatchup[]>(`/league/${encodeURIComponent(leagueId)}/losers_bracket`),
  );
}

export async function getLeagueDrafts(leagueId: string): Promise<SleeperDraft[] | null> {
  return cache.getOrSet(`leagueDrafts:${leagueId}`, CacheTtl.drafts, () =>
    sleeperGet<SleeperDraft[]>(`/league/${encodeURIComponent(leagueId)}/drafts`),
  );
}

export async function getDraft(draftId: string): Promise<SleeperDraft | null> {
  return cache.getOrSet(`draft:${draftId}`, CacheTtl.drafts, () =>
    sleeperGet<SleeperDraft>(`/draft/${encodeURIComponent(draftId)}`),
  );
}

export async function getDraftPicks(draftId: string): Promise<SleeperDraftPick[] | null> {
  return cache.getOrSet(`draftPicks:${draftId}`, CacheTtl.drafts, () =>
    sleeperGet<SleeperDraftPick[]>(`/draft/${encodeURIComponent(draftId)}/picks`),
  );
}

export async function getTradedPicks(leagueId: string): Promise<SleeperTradedPick[] | null> {
  return cache.getOrSet(`tradedPicks:${leagueId}`, CacheTtl.tradedPicks, () =>
    sleeperGet<SleeperTradedPick[]>(`/league/${encodeURIComponent(leagueId)}/traded_picks`),
  );
}

export async function getTrendingPlayers(
  type: TrendingType,
  lookbackHours: number,
  limit: number,
): Promise<SleeperTrendingPlayer[] | null> {
  const key = `trending:${type}:${lookbackHours}:${limit}`;
  return cache.getOrSet(key, CacheTtl.trending, () =>
    sleeperGet<SleeperTrendingPlayer[]>(
      `/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`,
    ),
  );
}
