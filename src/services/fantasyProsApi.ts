import { config } from '../config/env';
import { FantasyProsApiError } from '../utils/errors';
import { logger } from '../utils/logger';
import type {
  FantasyProsRanking,
  FantasyProsRankingsResponse,
  FantasyProsRankingType,
  FantasyProsScoring,
} from '../types/fantasyPros';

function optionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function optionalStringOrNumber(value: unknown): string | null {
  return (
    optionalString(value) ??
    (typeof value === 'number' && Number.isFinite(value) ? String(value) : null)
  );
}

function parseRanking(player: Record<string, unknown>): FantasyProsRanking | null {
  const playerName = optionalString(player.player_name) ?? optionalString(player.name);
  if (!playerName) return null;
  const positions = Array.isArray(player.player_positions) ? player.player_positions : [];
  const position =
    optionalString(player.player_position_id) ??
    optionalString(player.position_id) ??
    optionalString(player.position) ??
    (typeof positions[0] === 'string' ? positions[0] : null) ??
    '?';

  return {
    fantasyprosPlayerId: optionalNumber(player.player_id),
    playerName,
    position: position.toUpperCase(),
    team:
      optionalString(player.player_team_id) ??
      optionalString(player.team_id) ??
      optionalString(player.team),
    overallRank:
      optionalNumber(player.rank_ecr) ??
      optionalNumber(player.rank_ave) ??
      optionalNumber(player.rank),
    positionRank:
      optionalStringOrNumber(player.pos_rank) ?? optionalStringOrNumber(player.rank_ecr_pos),
    tier: optionalNumber(player.tier),
    adp: optionalNumber(player.rank_adp) ?? optionalNumber(player.adp),
  };
}

/**
 * Loads detailed consensus rankings. The official v2 endpoint requires
 * position=ALL; `type` selects DRAFT or ADP and `scoring` selects the format.
 */
export async function getNflConsensusRankings(options: {
  season: string;
  rankingType: FantasyProsRankingType;
  scoring: FantasyProsScoring;
}): Promise<{ rankings: FantasyProsRanking[]; sourceUpdatedAt: string | null }> {
  if (!config.fantasyProsApiKey) {
    throw new FantasyProsApiError(0, 'FantasyPros API key is not configured');
  }

  const query = new URLSearchParams({
    position: 'ALL',
    type: options.rankingType,
    scoring: options.scoring,
  });
  const url = `${config.fantasyProsBaseUrl}/nfl/${encodeURIComponent(options.season)}/consensus-rankings?${query}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'x-api-key': config.fantasyProsApiKey, accept: 'application/json' },
    });
  } catch (error) {
    logger.error('FantasyPros rankings network request failed', error);
    throw new FantasyProsApiError(0, 'FantasyPros network request failed');
  }

  if (!response.ok) {
    logger.error(`FantasyPros rankings request failed with status ${response.status}`);
    throw new FantasyProsApiError(response.status);
  }

  const body = (await response.json()) as FantasyProsRankingsResponse;
  const rankings = (body.players ?? [])
    .map((player) => parseRanking(player))
    .filter((ranking): ranking is FantasyProsRanking => ranking !== null);
  return {
    rankings,
    sourceUpdatedAt:
      body.last_updated_ts !== undefined
        ? new Date(body.last_updated_ts * 1000).toISOString()
        : (body.last_updated ?? null),
  };
}
