/**
 * Simple in-memory TTL cache. Good enough for a single-process MVP;
 * swap for the api_cache table or Redis if the bot ever runs on
 * multiple processes.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** Common TTLs (in milliseconds) for Sleeper data. */
export const CacheTtl = {
  leagueInfo: 5 * 60 * 1000,
  rosters: 2 * 60 * 1000,
  leagueUsers: 10 * 60 * 1000,
  matchups: 30 * 1000,
  transactions: 2 * 60 * 1000,
  nflState: 60 * 1000,
  trending: 5 * 60 * 1000,
  players: 24 * 60 * 60 * 1000,
} as const;

export function get<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function set<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Returns the cached value or runs the fetcher and caches its result. */
export async function getOrSet<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = get<T>(key);
  if (cached !== undefined) return cached;
  const value = await fetcher();
  set(key, value, ttlMs);
  return value;
}

export function clear(): void {
  store.clear();
}
