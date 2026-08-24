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
  projected_wins: z.number().min(0).max(15),
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

const SYSTEM_PROMPT = `You grade fantasy football drafts for fun. The supplied player rankings, roster construction metrics, draft results, and league settings are evidence, but the writing should sound like original fantasy-football analysis rather than a data-provider report. Do not invent player facts, schedules, injuries, projections, or statistics.

Every roster must appear exactly once. For each roster:
- Give a fair initial_score and projected_wins from 0 through 15 for a hypothetical 15-game fantasy regular season.
- Make strengths, weaknesses, and the summary lively, specific, and varied.
- Every individual strength and weakness must name at least one player from that roster's supplied players. Never name a player from another roster.
- Every strength, weakness, and summary must use genuinely different wording from every other roster. Never reuse a sentence template by merely swapping player, manager, or team names.
- Discuss weekly ceiling, lineup stability, depth, roster construction, injury/bye-week resilience, positional leverage, or volatility instead of mechanically restating ranks.
- FantasyPros, consensus rankings, and ADP are valid evidence. Use at most one direct reference to them per roster, and only when draft-day value tells a genuinely useful story.
- Be playful enough for league chat, but never insulting or personal.

Use the deterministic score as an objective anchor, but refine it based on the full roster and league fit. Return only valid JSON matching the requested structure, with no markdown or code fences. Draft grades and records are entertainment projections, not guarantees.`;

const OUTPUT_SHAPE = `Return one JSON object with this exact shape: {"league_summary":"string","teams":[{"roster_id":1,"sleeper_user_id":"string","team_name":"string","manager_name":"string","initial_score":85,"projected_wins":9,"grade":"B","strengths":["string"],"weaknesses":["string"],"summary":"string"}]}. Use only one of these grades: ${DRAFT_GRADES.join(', ')}.`;

function parseGitHubModelsResponse(content: string | null): DraftGradesAIResponse | null {
  if (!content) return null;
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed = DraftGradesAIResponseSchema.safeParse(JSON.parse(cleaned));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function generateWithGitHubModels(
  payload: string,
  correction: string,
): Promise<DraftGradesAIResponse | null> {
  if (!config.githubModelsToken) return null;
  const client = new OpenAI({
    apiKey: config.githubModelsToken,
    baseURL: config.githubModelsBaseUrl,
    defaultHeaders: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const response = await client.chat.completions.create({
    model: config.githubModelsModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${OUTPUT_SHAPE}\n\nLeague data:\n${payload}${correction}` },
    ],
    response_format: { type: 'json_object' },
  });
  return parseGitHubModelsResponse(response.choices[0]?.message.content ?? null);
}

async function generateWithOpenAI(
  payload: string,
  correction: string,
): Promise<DraftGradesAIResponse | null> {
  if (!config.openaiApiKey || !config.openaiModel) return null;
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const response = await client.responses.parse({
    model: config.openaiModel,
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${OUTPUT_SHAPE}\n\nLeague data:\n${payload}${correction}` },
    ],
    text: { format: zodTextFormat(DraftGradesAIResponseSchema, 'draft_grades') },
  });
  return response.output_parsed;
}

/** Returns null after two safe attempts so callers can use deterministic fallback. */
export async function generateAIDraftGrades(
  input: AIDraftGradeInput,
): Promise<DraftGradesAIResponse | null> {
  const expectedRosterIds = input.teams.map(({ profile }) => profile.rosterId);
  const payload = JSON.stringify(compactInput(input));
  const providerName = config.aiProvider === 'github' ? 'GitHub Models' : 'OpenAI';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const correction =
        attempt === 1
          ? '\nYour previous response was invalid or omitted/duplicated a roster. Return every supplied roster_id exactly once and obey the schema.'
          : '';
      const parsed =
        config.aiProvider === 'github'
          ? await generateWithGitHubModels(payload, correction)
          : await generateWithOpenAI(payload, correction);
      if (parsed && validRosterSet(parsed, expectedRosterIds)) return parsed;
      logger.warn(
        `${providerName} draft-grade attempt ${attempt + 1} returned invalid JSON or roster data`,
      );
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : `Unknown ${providerName} error`;
      logger.warn(`${providerName} draft-grade attempt ${attempt + 1} failed: ${safeMessage}`);
    }
  }
  return null;
}
