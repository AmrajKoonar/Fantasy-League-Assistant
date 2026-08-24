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

/** Uses medals for the top three places and a number for every other rank. */
export function formatRank(rank: number): string {
  return ['🥇', '🥈', '🥉'][rank - 1] ?? String(rank);
}

/** Consistent visual severity for Sleeper injury designations. */
export function injuryStatusEmoji(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'q' || normalized.includes('questionable')) return '🟡';
  if (normalized === 'd' || normalized.includes('doubtful')) return '🟠';
  if (
    normalized === 'o' ||
    normalized === 'ir' ||
    normalized.includes('out') ||
    normalized.includes('injured reserve')
  ) {
    return '🔴';
  }
  return '';
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
  const injuryEmoji = injuryStatusEmoji(player.injury_status);
  const injury = player.injury_status
    ? ` — ${injuryEmoji ? `${injuryEmoji} ` : ''}${player.injury_status}`
    : '';
  return `${name || playerId} (${position} - ${team})${injury}`;
}

/** Truncates text to fit Discord embed limits, adding an ellipsis. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export interface CodeTableColumn {
  header: string;
  align?: 'left' | 'right';
  maxWidth?: number;
}

export interface CodeTableOptions {
  forceCodeBlock?: boolean;
}

function cleanTableCell(value: unknown): string {
  return String(value ?? '—')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Approximate the width Discord uses for a grapheme in a monospaced code block. */
function graphemeWidth(grapheme: string): number {
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(grapheme)) return 2;
  const codePoint = grapheme.codePointAt(0) ?? 0;
  return codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6))
    ? 2
    : 1;
}

function graphemes(value: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...segmenter.segment(value)].map((part) => part.segment);
}

function displayWidth(value: string): number {
  return graphemes(value).reduce((width, grapheme) => width + graphemeWidth(grapheme), 0);
}

function fitTableCell(value: string, maxWidth: number): string {
  if (displayWidth(value) <= maxWidth) return value;
  const targetWidth = Math.max(1, maxWidth - 1);
  let result = '';
  let width = 0;
  for (const grapheme of graphemes(value)) {
    const nextWidth = graphemeWidth(grapheme);
    if (width + nextWidth > targetWidth) break;
    result += grapheme;
    width += nextWidth;
  }
  return `${result}…`;
}

function padTableCell(value: string, width: number, align: 'left' | 'right'): string {
  const padding = ' '.repeat(Math.max(0, width - displayWidth(value)));
  return align === 'right' ? `${padding}${value}` : `${value}${padding}`;
}

const MOBILE_SAFE_TABLE_WIDTH = 42;

function escapeDiscordMarkdown(value: string): string {
  return value.replace(/([\\*_~|>])/g, '\\$1');
}

function formatStackedTable(columns: CodeTableColumn[], rows: string[][]): string {
  const ordinalHeader = /^(?:#|rank|pick|slot|order)$/i;
  const hasOrdinal = columns.length > 1 && ordinalHeader.test(columns[0].header.trim());

  return rows
    .map((row) => {
      const ordinal = /^\d+$/.test(row[0]) ? `${row[0]}.` : row[0];
      const title = hasOrdinal
        ? `${ordinal} ${row[1]}`
        : columns[0].header.trim()
          ? `${columns[0].header}: ${row[0]}`
          : row[0];
      const detailsStart = hasOrdinal ? 2 : 1;
      const details = columns.slice(detailsStart).map((column, offset) => {
        const value = row[detailsStart + offset];
        const header = column.header.trim();
        return header
          ? `**${escapeDiscordMarkdown(header)}:** ${escapeDiscordMarkdown(value)}`
          : escapeDiscordMarkdown(value);
      });

      return [`**${escapeDiscordMarkdown(title)}**`, details.join(' • ')]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

/**
 * Builds a compact table when it safely fits on mobile. Wider results automatically
 * become stacked, labeled entries so renamed teams never break column alignment.
 */
export function formatCodeTable(
  columns: CodeTableColumn[],
  rows: unknown[][],
  options: CodeTableOptions = {},
): string {
  const cleanedHeaders = columns.map((column) =>
    fitTableCell(cleanTableCell(column.header), column.maxWidth ?? Number.POSITIVE_INFINITY),
  );
  const cleanedRows = rows.map((row) =>
    columns.map((column, index) =>
      fitTableCell(cleanTableCell(row[index]), column.maxWidth ?? Number.POSITIVE_INFINITY),
    ),
  );
  const widths = columns.map((column, index) => {
    const contentWidth = Math.max(
      displayWidth(cleanedHeaders[index]),
      ...cleanedRows.map((row) => displayWidth(row[index])),
    );
    return Math.min(contentWidth, column.maxWidth ?? contentWidth);
  });
  const renderedWidth =
    widths.reduce((total, width) => total + width, 0) + (columns.length - 1) * 2;
  if (!options.forceCodeBlock && renderedWidth > MOBILE_SAFE_TABLE_WIDTH) {
    return formatStackedTable(columns, cleanedRows);
  }
  const formatRow = (row: string[]): string =>
    row
      .map((cell, index) => padTableCell(cell, widths[index], columns[index].align ?? 'left'))
      .join('  ')
      .trimEnd();
  const separator = widths.map((width) => '-'.repeat(width)).join('  ');
  const lines = [formatRow(cleanedHeaders), separator, ...cleanedRows.map(formatRow)];
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
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
