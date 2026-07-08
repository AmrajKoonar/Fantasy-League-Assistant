import * as sleeperApi from './sleeperApi';
import * as playerCache from './playerCache';
import { Messages, UserFacingError } from '../utils/errors';
import { teamNameForRoster } from '../utils/formatting';
import type { SleeperLeagueUser, SleeperTransaction } from '../types/sleeper';

export interface TransactionView {
  type: string;
  status: string;
  adds: { playerName: string; teamName: string }[];
  drops: { playerName: string; teamName: string }[];
  faabSpent: number | null;
  teamsInvolved: string[];
  createdAt: number;
}

/**
 * Fetches a week's transactions and resolves player IDs and roster IDs
 * into readable names. Returns the newest transactions first.
 */
export async function getWeekTransactions(
  leagueId: string,
  week: number,
  limit = 10,
): Promise<TransactionView[]> {
  const [transactions, rosters, users] = await Promise.all([
    sleeperApi.getTransactions(leagueId, week),
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);

  if (!transactions || !rosters || !users) {
    throw new UserFacingError(Messages.genericFailure);
  }

  const players = await playerCache.getAllPlayers();
  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));
  const teamNameByRosterId = new Map<number, string>(
    rosters.map((r) => [r.roster_id, teamNameForRoster(r, usersById)]),
  );

  const teamName = (rosterId: number): string =>
    teamNameByRosterId.get(rosterId) ?? `Roster ${rosterId}`;

  const toView = (tx: SleeperTransaction): TransactionView => {
    const adds = Object.entries(tx.adds ?? {}).map(([playerId, rosterId]) => ({
      playerName: playerCache.formatPlayerName(players[playerId], playerId),
      teamName: teamName(rosterId),
    }));
    const drops = Object.entries(tx.drops ?? {}).map(([playerId, rosterId]) => ({
      playerName: playerCache.formatPlayerName(players[playerId], playerId),
      teamName: teamName(rosterId),
    }));
    return {
      type: tx.type,
      status: tx.status,
      adds,
      drops,
      faabSpent: tx.settings?.waiver_bid ?? null,
      teamsInvolved: (tx.roster_ids ?? []).map(teamName),
      createdAt: tx.created,
    };
  };

  return transactions
    .slice()
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, limit)
    .map(toView);
}
