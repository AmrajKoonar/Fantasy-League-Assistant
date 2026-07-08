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

/** Alias of {@link normalizeNickname} for league-nickname specific call sites. */
export function normalizeLeagueNickname(nickname: string): string {
  return normalizeNickname(nickname);
}

/** Alias of {@link normalizeSearch} for player-name specific call sites. */
export function normalizePlayerName(name: string): string {
  return normalizeSearch(name);
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

/**
 * Formats a millisecond epoch as a Discord timestamp. Style follows
 * Discord's timestamp styles (f = short date/time, R = relative, etc).
 */
export function formatTimestamp(epochMs: number, style: 'f' | 'F' | 'R' | 't' | 'D' = 'f'): string {
  return `<t:${Math.floor(epochMs / 1000)}:${style}>`;
}

/** A safe user mention. Never produces @everyone/@here. */
export function safeMentionUser(discordUserId: string): string {
  return `<@${discordUserId}>`;
}

/**
 * Splits long text into chunks that each fit within a Discord limit,
 * breaking on newlines where possible so lines are never split.
 */
export function chunkDiscordMessage(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    // A single line longer than the limit is hard-split as a fallback.
    if (line.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength));
      }
      continue;
    }
    if (current.length + line.length + 1 > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
