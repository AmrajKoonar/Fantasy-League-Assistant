import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { config } from '../config/env';
import { DRAFT_GRADES } from '../types/draftGrades';
import { logger } from '../utils/logger';
import type {
  DraftGradeMetrics,
  DraftGradesAIResponse,
  DraftGradeTeamProfile,
} from '../types/draftGrades';

const TeamSchema = z.object({
  roster_id: z.number().int(),
  sleeper_user_id: z.string(),
  team_name: z.string(),
  manager_name: z.string(),
  initial_score: z.number(),
  grade: z.enum(DRAFT_GRADES),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  summary: z.string(),
});

const DraftGradesAIResponseSchema = z.object({
  league_summary: z.string(),
  teams: z.array(TeamSchema),
});

export interface AIDraftGradeInput {
  leagueName: string;
  season: string;
  scoringSettings: Record<string, number>;
  rosterPositions: string[];
  draftPickValueAvailable: boolean;
  teams: Array<{ profile: DraftGradeTeamProfile; metrics: DraftGradeMetrics }>;
}

function validRosterSet(response: DraftGradesAIResponse, expectedRosterIds: number[]): boolean {
  const actual = response.teams.map((team) => team.roster_id);
  return (
    actual.length === expectedRosterIds.length &&
    new Set(actual).size === actual.length &&
    expectedRosterIds.every((rosterId) => actual.includes(rosterId)) &&
    actual.every((rosterId) => expectedRosterIds.includes(rosterId))
  );
}

function compactInput(input: AIDraftGradeInput): object {
  return {
    league_name: input.leagueName,
    season: input.season,
    roster_positions: input.rosterPositions,
    scoring_settings: input.scoringSettings,
    draft_pick_value_available: input.draftPickValueAvailable,
    teams: input.teams.map(({ profile, metrics }) => ({
      roster_id: profile.rosterId,
      sleeper_user_id: profile.sleeperUserId,
      team_name: profile.teamName,
      manager_name: profile.managerName,
      metrics,
      players: profile.players.map((player) => ({
        name: player.name,
        position: player.position,
        nfl_team: player.team,
        starter: player.isStarter,
        reserve: player.isReserve,
        taxi: player.isTaxi,
        injury_status: player.injuryStatus,
        overall_rank: player.fantasyprosOverallRank,
        position_rank: player.fantasyprosPositionRank,
        tier: player.fantasyprosTier,
        adp: player.fantasyprosAdp,
        unmatched: player.isUnmatched,
      })),
      draft_picks: profile.draftPicks,
    })),
  };
}

const SYSTEM_PROMPT = `You grade fantasy football drafts for fun. FantasyPros rankings and the supplied league settings are the primary evidence. Do not invent projections or facts. Compare teams relative to this league, be concise and specific, and never be mean or personal. Every roster must appear exactly once with strengths, weaknesses, and a short summary. Use the deterministic score as an objective anchor, but you may refine it based on roster construction and league fit. Do not include markdown. Draft grades are analysis only.`;

/** Returns null after two safe attempts so callers can use deterministic fallback. */
export async function generateAIDraftGrades(
  input: AIDraftGradeInput,
): Promise<DraftGradesAIResponse | null> {
  if (!config.openaiApiKey || !config.openaiModel) return null;

  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const expectedRosterIds = input.teams.map(({ profile }) => profile.rosterId);
  const payload = JSON.stringify(compactInput(input));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const correction =
        attempt === 1
          ? '\nYour previous response was invalid or omitted/duplicated a roster. Return every supplied roster_id exactly once and obey the schema.'
          : '';
      const response = await client.responses.parse({
        model: config.openaiModel,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${payload}${correction}` },
        ],
        text: { format: zodTextFormat(DraftGradesAIResponseSchema, 'draft_grades') },
      });
      const parsed = response.output_parsed;
      if (parsed && validRosterSet(parsed, expectedRosterIds)) return parsed;
      logger.warn(`OpenAI draft-grade attempt ${attempt + 1} returned an invalid roster set`);
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : 'Unknown OpenAI error';
      logger.warn(`OpenAI draft-grade attempt ${attempt + 1} failed: ${safeMessage}`);
    }
  }
  return null;
}
