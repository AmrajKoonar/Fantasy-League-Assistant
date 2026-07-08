import * as sleeperApi from './sleeperApi';
import { Messages, UserFacingError } from '../utils/errors';
import { teamNameForRoster } from '../utils/formatting';
import type { SleeperLeague, SleeperLeagueUser, SleeperRoster } from '../types/sleeper';

export interface ManagerEntry {
  rosterId: number | null;
  managerName: string;
  sleeperUsername: string | null;
  teamName: string;
  isCommissioner: boolean;
  avatar: string | null;
}

/** Joins league users with rosters to list every manager in a league. */
export async function getManagers(leagueId: string): Promise<ManagerEntry[]> {
  const [rosters, users] = await Promise.all([
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!users) throw new UserFacingError(Messages.genericFailure);

  const rosterList: SleeperRoster[] = rosters ?? [];
  const rosterByOwner = new Map<string, SleeperRoster>();
  for (const roster of rosterList) {
    if (roster.owner_id) rosterByOwner.set(roster.owner_id, roster);
  }
  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));

  return users
    .map((user): ManagerEntry => {
      const roster = rosterByOwner.get(user.user_id);
      const teamName = roster
        ? teamNameForRoster(roster, usersById)
        : user.metadata?.team_name?.trim() ||
          user.display_name ||
          user.username ||
          'Unknown Manager';
      return {
        rosterId: roster?.roster_id ?? null,
        managerName: user.display_name || user.username || 'Unknown Manager',
        sleeperUsername: user.username ?? null,
        teamName,
        isCommissioner: Boolean(user.is_owner),
        avatar: user.avatar ?? null,
      };
    })
    .sort((a, b) => (a.rosterId ?? 999) - (b.rosterId ?? 999));
}

export interface WaiverOrderEntry {
  teamName: string;
  managerName: string;
  waiverPosition: number | null;
}

/** Waiver priority order, ascending; missing values sorted to the bottom. */
export async function getWaiverOrder(leagueId: string): Promise<WaiverOrderEntry[]> {
  const [rosters, users] = await Promise.all([
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!rosters || !users) throw new UserFacingError(Messages.genericFailure);

  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));

  return rosters
    .map((roster): WaiverOrderEntry => {
      const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
      return {
        teamName: teamNameForRoster(roster, usersById),
        managerName: owner?.display_name ?? owner?.username ?? 'Unknown Manager',
        waiverPosition: roster.settings?.waiver_position ?? null,
      };
    })
    .sort((a, b) => {
      if (a.waiverPosition === null) return 1;
      if (b.waiverPosition === null) return -1;
      return a.waiverPosition - b.waiverPosition;
    });
}

export interface FaabEntry {
  teamName: string;
  managerName: string;
  used: number;
  remaining: number | null;
}

export interface FaabResult {
  usesFaab: boolean;
  totalBudget: number | null;
  entries: FaabEntry[];
}

/**
 * FAAB usage per team. Detects the total budget from league settings when
 * available (waiver_type 2 = FAAB). Never invents a budget.
 */
export async function getFaab(leagueId: string): Promise<FaabResult> {
  const [league, rosters, users] = await Promise.all([
    sleeperApi.getLeague(leagueId),
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!league || !rosters || !users) throw new UserFacingError(Messages.genericFailure);

  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));
  const totalBudget = detectFaabBudget(league);
  const usesFaab = league.settings?.waiver_type === 2 || (totalBudget ?? 0) > 0;

  const entries = rosters
    .map((roster): FaabEntry => {
      const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
      const used = roster.settings?.waiver_budget_used ?? 0;
      return {
        teamName: teamNameForRoster(roster, usersById),
        managerName: owner?.display_name ?? owner?.username ?? 'Unknown Manager',
        used,
        remaining: totalBudget !== null ? totalBudget - used : null,
      };
    })
    .sort((a, b) => {
      if (a.remaining !== null && b.remaining !== null) return b.remaining - a.remaining;
      return a.used - b.used;
    });

  return { usesFaab, totalBudget, entries };
}

/** Reads the FAAB budget from league settings, or null if not present. */
export function detectFaabBudget(league: SleeperLeague): number | null {
  const budget = league.settings?.waiver_budget;
  return typeof budget === 'number' && budget > 0 ? budget : null;
}

export interface MovesEntry {
  teamName: string;
  managerName: string;
  totalMoves: number;
}

/** Total roster moves per team, descending. */
export async function getMoves(leagueId: string): Promise<MovesEntry[]> {
  const [rosters, users] = await Promise.all([
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!rosters || !users) throw new UserFacingError(Messages.genericFailure);

  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));

  return rosters
    .map((roster): MovesEntry => {
      const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
      return {
        teamName: teamNameForRoster(roster, usersById),
        managerName: owner?.display_name ?? owner?.username ?? 'Unknown Manager',
        totalMoves: roster.settings?.total_moves ?? 0,
      };
    })
    .sort((a, b) => b.totalMoves - a.totalMoves);
}
