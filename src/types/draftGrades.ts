import type {
  FantasyProsRankingType,
  FantasyProsScoring,
  RankingMatchConfidence,
} from './fantasyPros';

export const DRAFT_GRADES = [
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
  'F',
] as const;

export type DraftGrade = (typeof DRAFT_GRADES)[number];

export interface DraftGradePlayer {
  sleeperPlayerId: string;
  name: string;
  position: string;
  team: string | null;
  isStarter: boolean;
  isReserve: boolean;
  isTaxi: boolean;
  injuryStatus: string | null;
  fantasyprosOverallRank: number | null;
  fantasyprosPositionRank: string | null;
  fantasyprosTier: number | null;
  fantasyprosAdp: number | null;
  rankingMatchConfidence: RankingMatchConfidence;
  isUnmatched: boolean;
}

export interface DraftPickValue {
  playerId: string;
  pickNumber: number;
  overallRank: number | null;
  valueDelta: number | null;
}

export interface DraftGradeTeamProfile {
  rosterId: number;
  sleeperUserId: string;
  discordUserId: string | null;
  teamName: string;
  managerName: string;
  players: DraftGradePlayer[];
  draftPicks: DraftPickValue[];
}

export interface PositionDepth {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  K: number;
  DEF: number;
  IR: number;
  TAXI: number;
}

export interface DraftGradeMetrics {
  rosterId: number;
  averageStarterRank: number | null;
  averageBenchRank: number | null;
  bestPlayerRank: number | null;
  top24PlayersCount: number;
  top50PlayersCount: number;
  top100PlayersCount: number;
  positionDepth: PositionDepth;
  starterRankByPosition: Record<string, number | null>;
  benchDepthScore: number;
  rosterBalanceScore: number;
  scarcityScore: number;
  injuryRiskCount: number;
  unmatchedPlayersCount: number;
  draftValueScore: number | null;
  scoringFitScore: number;
  deterministicScore: number;
  draftPickValueAvailable: boolean;
}

export interface AIDraftGradeTeam {
  roster_id: number;
  sleeper_user_id: string;
  team_name: string;
  manager_name: string;
  initial_score: number;
  grade: DraftGrade;
  strengths: string[];
  weaknesses: string[];
  summary: string;
}

export interface DraftGradesAIResponse {
  league_summary: string;
  teams: AIDraftGradeTeam[];
}

export interface DraftGradeTeamResult {
  roster_id: number;
  sleeper_user_id: string;
  discord_user_id: string | null;
  team_name: string;
  manager_name: string;
  grade: DraftGrade;
  score: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
  metrics: DraftGradeMetrics;
}

export interface DraftGradesResult {
  version: 1;
  league_id: string;
  league_nickname: string;
  league_name: string;
  season: string;
  ranking_source: 'fantasypros';
  ranking_type: FantasyProsRankingType;
  scoring: FantasyProsScoring;
  generated_at: string;
  ai_analysis_used: boolean;
  league_summary: string;
  draft_pick_value_available: boolean;
  teams: DraftGradeTeamResult[];
}
