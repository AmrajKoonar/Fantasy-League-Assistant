export type FantasyProsRankingType = 'DRAFT' | 'ADP';
export type FantasyProsScoring = 'STD' | 'HALF' | 'PPR';
export type RankingMatchConfidence = 'high' | 'medium' | 'none';

export interface FantasyProsRanking {
  fantasyprosPlayerId: number | null;
  playerName: string;
  position: string;
  team: string | null;
  overallRank: number | null;
  positionRank: string | null;
  tier: number | null;
  adp: number | null;
}

export interface FantasyProsRankingsResponse {
  season?: string | number;
  year?: string | number;
  ranking_type_name?: string;
  last_updated?: string;
  last_updated_ts?: number;
  players?: Array<Record<string, unknown>>;
}

export interface FantasyProsRankingSnapshot {
  season: string;
  rankingType: FantasyProsRankingType;
  scoring: FantasyProsScoring;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  rankings: FantasyProsRanking[];
}
