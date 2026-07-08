import type { SleeperLeagueUser, SleeperPlayer, SleeperRoster } from '../types/sleeper';

/**
 * Normalizes a league nickname for storage and lookup.
 * "Division 1" -> "division1", "Money League" -> "moneyleague"
 */
export function normalizeNickname(nickname: string): string {
  return nickname.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Normalizes a search string: lowercase, letters and numbers only. */
export function normalizeSearch(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** "12-2" or "12-2-1" when there are ties. */
export function formatRecord(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/**
 * Best display name for a fantasy team: custom team name if set,
 * otherwise the owner's display name, otherwise a roster placeholder.
 */
export function teamNameForRoster(
  roster: SleeperRoster,
  usersById: Map<string, SleeperLeagueUser>,
): string {
  const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
  const teamName = owner?.metadata?.team_name;
  if (teamName && teamName.trim().length > 0) return teamName.trim();
  if (owner?.display_name) return owner.display_name;
  return `Roster ${roster.roster_id}`;
}

/** "Josh Allen (QB - BUF)" with optional injury tag. */
export function formatPlayerLine(player: SleeperPlayer | undefined, playerId: string): string {
  if (!player) {
    // Team defenses use the team abbreviation as the player ID (e.g. "SF").
    if (/^[A-Z]{2,4}$/.test(playerId)) return `${playerId} (DEF)`;
    return `Unknown player (${playerId})`;
  }
  const name = player.full_name ?? [player.first_name, player.last_name].filter(Boolean).join(' ');
  const position = player.position ?? player.fantasy_positions?.[0] ?? '?';
  const team = player.team ?? 'FA';
  const injury = player.injury_status ? ` — ${player.injury_status}` : '';
  return `${name || playerId} (${position} - ${team})${injury}`;
}

/** Truncates text to fit Discord embed limits, adding an ellipsis. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/** Formats a millisecond epoch as a Discord relative timestamp (e.g. "2 hours ago"). */
export function discordRelativeTime(epochMs: number): string {
  return `<t:${Math.floor(epochMs / 1000)}:R>`;
}
