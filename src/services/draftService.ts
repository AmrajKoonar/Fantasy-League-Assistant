import * as sleeperApi from './sleeperApi';
import * as playerCache from './playerCache';
import { getTeamNamesByRosterId } from './rosterService';
import { Messages, UserFacingError } from '../utils/errors';
import { teamNameForRoster } from '../utils/formatting';
import type { SleeperDraft, SleeperLeagueUser } from '../types/sleeper';

/**
 * Picks the most relevant draft for a league: an in-progress or upcoming
 * draft if one exists, otherwise the most recent. Sleeper returns drafts
 * newest first.
 */
export async function getRelevantDraft(leagueId: string): Promise<SleeperDraft | null> {
  const drafts = await sleeperApi.getLeagueDrafts(leagueId);
  if (!drafts || drafts.length === 0) return null;
  const active = drafts.find((d) => d.status === 'drafting' || d.status === 'paused');
  const upcoming = drafts.find((d) => d.status === 'pre_draft');
  return active ?? upcoming ?? drafts[0];
}

export interface DraftOrderEntry {
  slot: number;
  teamName: string;
  managerName: string;
}

export interface DraftOrderView {
  draft: SleeperDraft;
  isAuction: boolean;
  order: DraftOrderEntry[];
}

/**
 * Builds the draft order by mapping draft slots to rosters/managers.
 * Uses slot_to_roster_id when present, otherwise draft_order (user -> slot).
 */
export async function getDraftOrder(leagueId: string): Promise<DraftOrderView | null> {
  const draft = await getRelevantDraft(leagueId);
  if (!draft) return null;

  const isAuction = draft.type === 'auction';

  const [rosters, users] = await Promise.all([
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!users) throw new UserFacingError(Messages.genericFailure);

  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));
  const rosterById = new Map((rosters ?? []).map((r) => [r.roster_id, r]));

  const entries: DraftOrderEntry[] = [];

  if (draft.slot_to_roster_id) {
    for (const [slotStr, rosterId] of Object.entries(draft.slot_to_roster_id)) {
      const roster = rosterById.get(rosterId);
      const owner = roster?.owner_id ? usersById.get(roster.owner_id) : undefined;
      entries.push({
        slot: Number(slotStr),
        teamName: roster ? teamNameForRoster(roster, usersById) : `Roster ${rosterId}`,
        managerName: owner?.display_name ?? owner?.username ?? 'Unknown Manager',
      });
    }
  } else if (draft.draft_order) {
    for (const [userId, slot] of Object.entries(draft.draft_order)) {
      const user = usersById.get(userId);
      entries.push({
        slot,
        teamName: user?.metadata?.team_name?.trim() || user?.display_name || `User ${userId}`,
        managerName: user?.display_name ?? user?.username ?? 'Unknown Manager',
      });
    }
  }

  entries.sort((a, b) => a.slot - b.slot);
  return { draft, isAuction, order: entries };
}

export interface DraftResultPick {
  round: number;
  pickNo: number;
  playerName: string;
  position: string;
  team: string;
  teamName: string;
  isAuction: boolean;
  amount: number | null;
}

export interface DraftResultsView {
  draft: SleeperDraft;
  round: number;
  picks: DraftResultPick[];
  totalRounds: number;
}

/**
 * Draft picks for a given round (defaults to round 1). Maps player IDs to
 * names and roster IDs to team names. Handles auction drafts gracefully.
 */
export async function getDraftResults(
  leagueId: string,
  round?: number,
): Promise<DraftResultsView | null> {
  const draft = await getRelevantDraft(leagueId);
  if (!draft) return null;

  const picks = await sleeperApi.getDraftPicks(draft.draft_id);
  if (!picks || picks.length === 0) {
    return { draft, round: round ?? 1, picks: [], totalRounds: draft.settings?.rounds ?? 0 };
  }

  const targetRound = round ?? 1;
  const isAuction = draft.type === 'auction';
  const teamNames = await getTeamNamesByRosterId(leagueId);
  const players = await playerCache.getAllPlayers();

  const resultPicks: DraftResultPick[] = picks
    .filter((p) => p.round === targetRound)
    .sort((a, b) => a.pick_no - b.pick_no)
    .map((pick) => {
      const player = players[pick.player_id];
      const metaName = [pick.metadata?.first_name, pick.metadata?.last_name]
        .filter(Boolean)
        .join(' ');
      const name = player?.full_name ?? (metaName || pick.player_id);
      const amountRaw = (pick.metadata as Record<string, unknown> | undefined)?.amount;
      return {
        round: pick.round,
        pickNo: pick.pick_no,
        playerName: name,
        position: player?.position ?? pick.metadata?.position ?? '?',
        team: player?.team ?? pick.metadata?.team ?? 'FA',
        teamName:
          pick.roster_id !== null
            ? (teamNames.get(pick.roster_id) ?? `Roster ${pick.roster_id}`)
            : 'Unknown team',
        isAuction,
        amount: typeof amountRaw === 'string' ? Number(amountRaw) : null,
      };
    });

  return {
    draft,
    round: targetRound,
    picks: resultPicks,
    totalRounds: draft.settings?.rounds ?? 0,
  };
}
