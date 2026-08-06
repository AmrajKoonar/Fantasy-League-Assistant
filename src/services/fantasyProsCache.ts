import { config } from '../config/env';
import { FantasyProsApiError, UserFacingError } from '../utils/errors';
import { normalizeSearch } from '../utils/formatting';
import { getNflConsensusRankings } from './fantasyProsApi';
import type { SleeperPlayer } from '../types/sleeper';
import type {
  FantasyProsRanking,
  FantasyProsRankingSnapshot,
  FantasyProsRankingType,
  FantasyProsScoring,
  RankingMatchConfidence,
} from '../types/fantasyPros';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; snapshot: FantasyProsRankingSnapshot }>();
const inFlight = new Map<string, Promise<FantasyProsRankingSnapshot>>();

function cacheKey(season: string, scoring: FantasyProsScoring): string {
  return `${season}:${scoring}`;
}

export async function getFantasyProsRankings(
  season: string,
  scoring: FantasyProsScoring,
): Promise<FantasyProsRankingSnapshot> {
  const key = cacheKey(season, scoring);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.snapshot;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const preferred = config.fantasyProsDefaultRankingType === 'ADP' ? 'ADP' : 'DRAFT';
    const attempts: FantasyProsRankingType[] = preferred === 'DRAFT' ? ['DRAFT', 'ADP'] : ['ADP'];
    let lastError: unknown;
    for (const rankingType of attempts) {
      try {
        const response = await getNflConsensusRankings({ season, rankingType, scoring });
        if (response.rankings.length === 0) continue;
        const snapshot: FantasyProsRankingSnapshot = {
          season,
          scoring,
          rankingType,
          fetchedAt: new Date().toISOString(),
          sourceUpdatedAt: response.sourceUpdatedAt,
          rankings: response.rankings,
        };
        cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, snapshot });
        return snapshot;
      } catch (error) {
        lastError = error;
        if (error instanceof FantasyProsApiError && [401, 403, 429].includes(error.status)) break;
      }
    }
    if (lastError instanceof FantasyProsApiError && [401, 403].includes(lastError.status)) {
      throw new UserFacingError(
        'I could not authenticate with FantasyPros. Ask the bot administrator to check FANTASYPROS_API_KEY.',
        'FantasyPros configuration error',
      );
    }
    if (lastError instanceof FantasyProsApiError && lastError.status === 429) {
      throw new UserFacingError(
        'FantasyPros is rate-limiting ranking requests right now. Please try again later.',
        'FantasyPros rate limit',
      );
    }
    throw new UserFacingError(
      'I could not load FantasyPros rankings for this season. Try again later.',
      'Rankings unavailable',
    );
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

function normalizedPlayerName(name: string): string {
  return normalizeSearch(name.replace(/\b(jr|sr|ii|iii|iv|v)\.?$/i, '').replace(/[’']/g, ''));
}

export interface FantasyProsPlayerMatch {
  ranking: FantasyProsRanking | null;
  confidence: RankingMatchConfidence;
}

/** Matches providers by normalized name, then disambiguates by position and NFL team. */
export function matchSleeperPlayerToFantasyProsRanking(
  sleeperPlayer: SleeperPlayer,
  fantasyProsRankings: FantasyProsRanking[],
): FantasyProsPlayerMatch {
  const sleeperName =
    sleeperPlayer.full_name ??
    [sleeperPlayer.first_name, sleeperPlayer.last_name].filter(Boolean).join(' ');
  const normalized = normalizedPlayerName(sleeperName);
  if (!normalized) return { ranking: null, confidence: 'none' };

  const sameName = fantasyProsRankings.filter(
    (ranking) => normalizedPlayerName(ranking.playerName) === normalized,
  );
  if (sameName.length === 0) return { ranking: null, confidence: 'none' };

  const position = (
    sleeperPlayer.position ??
    sleeperPlayer.fantasy_positions?.[0] ??
    ''
  ).toUpperCase();
  const samePosition = sameName.filter((ranking) => ranking.position === position);
  const candidates = samePosition.length > 0 ? samePosition : sameName;
  const sleeperTeam = sleeperPlayer.team?.toUpperCase();
  const sameTeam = sleeperTeam
    ? candidates.filter((ranking) => ranking.team?.toUpperCase() === sleeperTeam)
    : [];
  if (sameTeam.length === 1) return { ranking: sameTeam[0], confidence: 'high' };
  if (candidates.length === 1) return { ranking: candidates[0], confidence: 'medium' };
  return { ranking: null, confidence: 'none' };
}
