/**
 * Discord-only trade offers. This service NEVER submits trades to Sleeper
 * (the Sleeper API is read-only). It parses/validates the proposed assets
 * against each manager's real Sleeper roster, persists the offer, and
 * builds the Discord message (embed + buttons) shown to both managers.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbedField,
} from 'discord.js';
import * as sleeperApi from './sleeperApi';
import * as playerCache from './playerCache';
import * as tradeOffersRepo from '../db/repositories/tradeOffersRepository';
import { errorEmbed, infoEmbed, successEmbed, warningEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { normalizePlayerName, safeMentionUser, truncate } from '../utils/formatting';
import type {
  InsertTradeOfferInput,
  ParsedTradeAssets,
  TradeOfferRow,
  TradeOfferStatus,
} from '../types/database';
import type { SleeperPlayersMap, SleeperRoster } from '../types/sleeper';

const DISCLAIMER =
  'This is a Discord-only proposal. Complete the actual trade in Sleeper if both managers agree.';

// ---------------------------------------------------------------------------
// Parsing & validation
// ---------------------------------------------------------------------------

/** Splits a trade side into segments on commas, plus signs, and "and". */
function splitSegments(text: string): string[] {
  return text
    .split(/[,+]|\band\b/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface ParsedTradeInput {
  names: string[];
  faab: number | null;
}

/**
 * Best-effort parse of a trade side like "Justin Jefferson + $10 FAAB".
 * FAAB is detected by a "$" or the word "faab"; everything else is a name.
 */
export function parseTradeAssets(text: string): ParsedTradeInput {
  const names: string[] = [];
  let faab: number | null = null;

  for (const segment of splitSegments(text)) {
    const isFaab = /faab/i.test(segment) || segment.includes('$');
    const numberMatch = segment.match(/(\d+)/);
    if (isFaab && numberMatch) {
      faab = (faab ?? 0) + Number(numberMatch[1]);
      continue;
    }
    names.push(segment);
  }

  return { names, faab };
}

interface RosterPlayerCandidate {
  id: string;
  normalized: string;
  displayName: string;
}

function buildRosterCandidates(
  roster: SleeperRoster,
  players: SleeperPlayersMap,
): RosterPlayerCandidate[] {
  return (roster.players ?? []).map((id) => {
    const player = players[id];
    const displayName = playerCache.formatPlayerName(player, id);
    return { id, normalized: normalizePlayerName(displayName), displayName };
  });
}

type TokenMatch =
  | { kind: 'matched'; id: string; name: string }
  | { kind: 'ambiguous'; token: string; options: string[] }
  | { kind: 'notFound'; token: string };

function matchToken(token: string, candidates: RosterPlayerCandidate[]): TokenMatch {
  const norm = normalizePlayerName(token);
  if (!norm) return { kind: 'notFound', token };

  const exact = candidates.filter((c) => c.normalized === norm);
  if (exact.length === 1) return { kind: 'matched', id: exact[0].id, name: exact[0].displayName };
  if (exact.length > 1) {
    return { kind: 'ambiguous', token, options: exact.map((c) => c.displayName) };
  }

  const partial = candidates.filter(
    (c) => c.normalized.includes(norm) || norm.includes(c.normalized),
  );
  if (partial.length === 1) {
    return { kind: 'matched', id: partial[0].id, name: partial[0].displayName };
  }
  if (partial.length > 1) {
    return { kind: 'ambiguous', token, options: partial.map((c) => c.displayName) };
  }
  return { kind: 'notFound', token };
}

export interface SideResolution {
  assets: ParsedTradeAssets;
  ambiguous: { token: string; options: string[] }[];
  notFound: string[];
}

/** Resolves one trade side against the roster that must own those players. */
export function resolveTradeSide(
  text: string,
  roster: SleeperRoster,
  players: SleeperPlayersMap,
): SideResolution {
  const parsed = parseTradeAssets(text);
  const candidates = buildRosterCandidates(roster, players);

  const playerIds: string[] = [];
  const playerNames: string[] = [];
  const ambiguous: { token: string; options: string[] }[] = [];
  const notFound: string[] = [];

  for (const name of parsed.names) {
    const match = matchToken(name, candidates);
    if (match.kind === 'matched') {
      playerIds.push(match.id);
      playerNames.push(match.name);
    } else if (match.kind === 'ambiguous') {
      ambiguous.push({ token: match.token, options: match.options });
    } else {
      notFound.push(match.token);
    }
  }

  return {
    assets: { playerIds, playerNames, faab: parsed.faab, unmatched: notFound },
    ambiguous,
    notFound,
  };
}

export interface ValidatedTrade {
  parsedSend: ParsedTradeAssets;
  parsedReceive: ParsedTradeAssets;
}

/**
 * Strictly validates that the "send" players are on the sender's roster and
 * the "receive" players are on the target's roster. Throws a friendly
 * UserFacingError describing every problem. FAAB is not blocked.
 */
export function validateTrade(options: {
  sendText: string;
  receiveText: string;
  fromRoster: SleeperRoster;
  toRoster: SleeperRoster;
  players: SleeperPlayersMap;
  fromLabel: string;
  toLabel: string;
}): ValidatedTrade {
  const send = resolveTradeSide(options.sendText, options.fromRoster, options.players);
  const receive = resolveTradeSide(options.receiveText, options.toRoster, options.players);

  const problems: string[] = [];

  for (const amb of send.ambiguous) {
    problems.push(`"${amb.token}" could be: ${amb.options.join(', ')}. Please be more specific.`);
  }
  for (const amb of receive.ambiguous) {
    problems.push(`"${amb.token}" could be: ${amb.options.join(', ')}. Please be more specific.`);
  }
  for (const missing of send.notFound) {
    problems.push(`I could not find "${missing}" on ${options.fromLabel}'s roster.`);
  }
  for (const missing of receive.notFound) {
    problems.push(`I could not find "${missing}" on ${options.toLabel}'s roster.`);
  }

  const sendHasAssets = send.assets.playerIds.length > 0 || send.assets.faab !== null;
  const receiveHasAssets = receive.assets.playerIds.length > 0 || receive.assets.faab !== null;
  if (!sendHasAssets) problems.push('The "send" side has no valid players or FAAB.');
  if (!receiveHasAssets) problems.push('The "receive" side has no valid players or FAAB.');

  if (problems.length > 0) {
    throw new UserFacingError(problems.map((p) => `• ${p}`).join('\n'), 'Trade validation failed');
  }

  return { parsedSend: send.assets, parsedReceive: receive.assets };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Inserts a validated trade offer (status pending, no message yet). */
export async function createTradeOffer(input: InsertTradeOfferInput): Promise<TradeOfferRow> {
  return tradeOffersRepo.insertTradeOffer(input);
}

export async function attachMessage(
  id: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  return tradeOffersRepo.attachMessage(id, channelId, messageId);
}

export async function getTradeOffer(id: string): Promise<TradeOfferRow | null> {
  return tradeOffersRepo.getTradeOfferById(id);
}

export async function setStatus(id: string, status: TradeOfferStatus): Promise<TradeOfferRow> {
  return tradeOffersRepo.updateStatus(id, status);
}

/**
 * Builds the reversed asset/roster fields for a counteroffer. The new offer
 * flows from the original target back to the original sender, so the sides
 * swap by default (overridable with explicit send/receive text).
 */
export async function prepareCounterOffer(options: {
  parent: TradeOfferRow;
  actorDiscordUserId: string;
  overrideSendText?: string | null;
  overrideReceiveText?: string | null;
  note?: string | null;
}): Promise<InsertTradeOfferInput> {
  const { parent, actorDiscordUserId } = options;

  if (actorDiscordUserId !== parent.to_discord_user_id) {
    throw new UserFacingError(
      'Only the manager who received this trade offer can counter it.',
      'Not allowed',
    );
  }
  if (parent.status !== 'pending' && parent.status !== 'countered') {
    throw new UserFacingError(
      `This trade offer is already **${parent.status}** and can no longer be countered.`,
      'Cannot counter',
    );
  }

  // Default: swap sides. The original target now sends what they were being
  // asked to give up (the original "receive"), and receives the original "send".
  const sendText = options.overrideSendText?.trim() || parent.receive_text;
  const receiveText = options.overrideReceiveText?.trim() || parent.send_text;

  const rosters = await sleeperApi.getLeagueRosters(parent.league_id);
  const players = await playerCache.getAllPlayers();
  const fromRoster =
    parent.to_roster_id !== null
      ? rosters?.find((r) => r.roster_id === parent.to_roster_id)
      : undefined;
  const toRoster =
    parent.from_roster_id !== null
      ? rosters?.find((r) => r.roster_id === parent.from_roster_id)
      : undefined;

  if (!fromRoster || !toRoster) {
    throw new UserFacingError(
      'I could not load both rosters for this league to validate the counteroffer.',
      'Roster lookup failed',
    );
  }

  const validated = validateTrade({
    sendText,
    receiveText,
    fromRoster,
    toRoster,
    players,
    fromLabel: 'you',
    toLabel: 'the other manager',
  });

  return {
    guild_id: parent.guild_id,
    channel_id: null,
    message_id: null,
    league_id: parent.league_id,
    league_nickname: parent.league_nickname,
    from_discord_user_id: parent.to_discord_user_id,
    to_discord_user_id: parent.from_discord_user_id,
    from_sleeper_user_id: parent.to_sleeper_user_id,
    to_sleeper_user_id: parent.from_sleeper_user_id,
    from_roster_id: parent.to_roster_id,
    to_roster_id: parent.from_roster_id,
    send_text: sendText,
    receive_text: receiveText,
    parsed_send: validated.parsedSend,
    parsed_receive: validated.parsedReceive,
    status: 'pending',
    note: options.note?.trim() || null,
    parent_trade_offer_id: parent.id,
  };
}

// ---------------------------------------------------------------------------
// Discord rendering
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<TradeOfferStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted ✅',
  declined: 'Declined ❌',
  countered: 'Countered 🔁',
  expired: 'Expired ⌛',
  cancelled: 'Cancelled 🚫',
};

function embedForStatus(status: TradeOfferStatus, title: string): EmbedBuilder {
  switch (status) {
    case 'accepted':
      return successEmbed(title);
    case 'declined':
    case 'cancelled':
    case 'expired':
      return errorEmbed(title);
    case 'countered':
      return warningEmbed(title);
    default:
      return infoEmbed(title);
  }
}

/** Builds the trade-offer embed shown in the channel. */
export function buildTradeEmbed(row: TradeOfferRow): EmbedBuilder {
  const embed = embedForStatus(row.status, 'Trade Offer').setDescription(DISCLAIMER);

  const fields: APIEmbedField[] = [
    { name: 'League', value: row.league_nickname, inline: true },
    { name: 'From', value: safeMentionUser(row.from_discord_user_id), inline: true },
    { name: 'To', value: safeMentionUser(row.to_discord_user_id), inline: true },
    { name: 'Sender gives', value: truncate(row.send_text, 1024), inline: false },
    { name: 'Sender receives', value: truncate(row.receive_text, 1024), inline: false },
    { name: 'Status', value: STATUS_LABEL[row.status], inline: true },
  ];
  if (row.note) fields.push({ name: 'Note', value: truncate(row.note, 1024), inline: false });
  fields.push({ name: 'Trade ID', value: `\`${row.id}\``, inline: false });

  embed.addFields(fields);
  return embed;
}

/** Accept / Decline / Counteroffer buttons for a pending offer. */
export function buildTradeComponents(
  tradeId: string,
  disabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade:accept:${tradeId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`trade:decline:${tradeId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`trade:counter:${tradeId}`)
      .setLabel('Counteroffer')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
  return [row];
}
