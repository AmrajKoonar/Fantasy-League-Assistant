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

export interface TradeSide {
  teamName: string;
  received: string[];
}

export interface TradeView {
  status: string;
  createdAt: number;
  sides: TradeSide[];
}

/**
 * Trades for a week, newest first. Resolves player IDs, roster IDs, draft
 * picks, and FAAB into per-team "received" lists.
 */
export async function getTrades(leagueId: string, week: number, limit = 10): Promise<TradeView[]> {
  const [transactions, rosters, users] = await Promise.all([
    sleeperApi.getTransactions(leagueId, week),
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!transactions || !rosters || !users) throw new UserFacingError(Messages.genericFailure);

  const players = await playerCache.getAllPlayers();
  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));
  const teamNameByRosterId = new Map<number, string>(
    rosters.map((r) => [r.roster_id, teamNameForRoster(r, usersById)]),
  );
  const teamName = (rosterId: number): string =>
    teamNameByRosterId.get(rosterId) ?? `Roster ${rosterId}`;

  return transactions
    .filter((tx) => tx.type === 'trade')
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, limit)
    .map((tx): TradeView => {
      const rosterIds = tx.roster_ids ?? [];
      const sides: TradeSide[] = rosterIds.map((rosterId) => {
        const received: string[] = [];
        for (const [playerId, toRoster] of Object.entries(tx.adds ?? {})) {
          if (toRoster === rosterId) {
            received.push(playerCache.formatPlayerName(players[playerId], playerId));
          }
        }
        for (const pick of tx.draft_picks ?? []) {
          if (pick.owner_id === rosterId) {
            received.push(`${pick.season} Round ${pick.round} pick`);
          }
        }
        for (const budget of tx.waiver_budget ?? []) {
          if (budget.receiver === rosterId) received.push(`$${budget.amount} FAAB`);
        }
        return {
          teamName: teamName(rosterId),
          received: received.length > 0 ? received : ['(nothing)'],
        };
      });
      return { status: tx.status, createdAt: tx.created, sides };
    });
}

export interface WaiverActivityView {
  type: string;
  status: string;
  teamName: string;
  added: string[];
  dropped: string[];
  faab: number | null;
  createdAt: number;
}

/**
 * Waiver and free-agent activity for a week, newest first. One entry per
 * transaction, attributed to the acting team.
 */
export async function getWaiverActivity(
  leagueId: string,
  week: number,
  limit = 10,
): Promise<WaiverActivityView[]> {
  const [transactions, rosters, users] = await Promise.all([
    sleeperApi.getTransactions(leagueId, week),
    sleeperApi.getLeagueRosters(leagueId),
    sleeperApi.getLeagueUsers(leagueId),
  ]);
  if (!transactions || !rosters || !users) throw new UserFacingError(Messages.genericFailure);

  const players = await playerCache.getAllPlayers();
  const usersById = new Map<string, SleeperLeagueUser>(users.map((u) => [u.user_id, u]));
  const teamNameByRosterId = new Map<number, string>(
    rosters.map((r) => [r.roster_id, teamNameForRoster(r, usersById)]),
  );
  const teamName = (rosterId: number): string =>
    teamNameByRosterId.get(rosterId) ?? `Roster ${rosterId}`;

  return transactions
    .filter((tx) => tx.type === 'waiver' || tx.type === 'free_agent')
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, limit)
    .map((tx): WaiverActivityView => {
      const actingRoster = tx.roster_ids?.[0];
      return {
        type: tx.type,
        status: tx.status,
        teamName: actingRoster !== undefined ? teamName(actingRoster) : 'Unknown team',
        added: Object.keys(tx.adds ?? {}).map((id) =>
          playerCache.formatPlayerName(players[id], id),
        ),
        dropped: Object.keys(tx.drops ?? {}).map((id) =>
          playerCache.formatPlayerName(players[id], id),
        ),
        faab: tx.settings?.waiver_bid ?? null,
        createdAt: tx.created,
      };
    });
}
