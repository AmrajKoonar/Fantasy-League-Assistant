import * as sleeperApi from './sleeperApi';
import * as linkedUsersRepo from '../db/repositories/linkedUsersRepository';
import { getRelevantDraft } from './draftService';
import { waiverTypeLabel } from './leagueSettingsService';
import { Messages, UserFacingError } from '../utils/errors';
import type { SleeperDraft } from '../types/sleeper';

export interface LeagueMemberLinks {
  /** Discord user IDs of league members who have linked their account. */
  linkedDiscordUserIds: string[];
  /** Number of league members with no linked Discord account. */
  unlinkedCount: number;
}

/**
 * Maps the Sleeper members of a league to their linked Discord accounts.
 * Only returns members who have linked, so reminders never ping strangers.
 */
export async function getLeagueMembersWithDiscordLinks(
  leagueId: string,
): Promise<LeagueMemberLinks> {
  const users = await sleeperApi.getLeagueUsers(leagueId);
  if (!users) throw new UserFacingError(Messages.genericFailure);

  const sleeperUserIds = users.map((u) => u.user_id);
  const linked = await linkedUsersRepo.getLinkedUsersBySleeperIds(sleeperUserIds);
  const linkedSleeperIds = new Set(linked.map((l) => l.sleeper_user_id));

  return {
    linkedDiscordUserIds: linked.map((l) => l.discord_user_id),
    unlinkedCount: sleeperUserIds.filter((id) => !linkedSleeperIds.has(id)).length,
  };
}

export interface DraftReminderData {
  draft: SleeperDraft | null;
  startTimeMs: number | null;
}

/** Draft details for the reminder, including start time when Sleeper has one. */
export async function getDraftReminderData(leagueId: string): Promise<DraftReminderData> {
  const draft = await getRelevantDraft(leagueId);
  const startTimeMs = draft?.start_time && draft.start_time > 0 ? draft.start_time : null;
  return { draft, startTimeMs };
}

export interface WaiverReminderData {
  week: number;
  waiverType: string;
  faabBudget: number | null;
}

/** Waiver context for the reminder: current week and waiver settings. */
export async function getWaiverReminderData(leagueId: string): Promise<WaiverReminderData> {
  const [league, state] = await Promise.all([
    sleeperApi.getLeague(leagueId),
    sleeperApi.getNflState(),
  ]);
  if (!league) throw new UserFacingError(Messages.genericFailure);

  const week = state?.display_week ?? state?.week ?? 0;
  const faabBudget = league.settings?.waiver_budget;
  return {
    week: week && week > 0 ? week : 0,
    waiverType: waiverTypeLabel(league.settings?.waiver_type),
    faabBudget: typeof faabBudget === 'number' && faabBudget > 0 ? faabBudget : null,
  };
}
