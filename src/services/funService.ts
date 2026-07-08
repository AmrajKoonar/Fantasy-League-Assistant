/**
 * Light, friendly "for fun" calculations. None of this is official
 * Sleeper data — it is all bot-computed and clearly labelled as such.
 * Jokes are kept fantasy-football specific and never personal.
 */

import { getManagers, type ManagerEntry } from './managerService';
import type { TeamStat } from './teamService';

export interface LuckRating {
  standingsRank: number;
  pointsForRank: number;
  /** Positive = luckier (better standing than scoring would suggest). */
  luckScore: number;
  rating: string;
  line: string;
}

/**
 * Compares a team's standings rank to its points-for rank. A team that
 * ranks higher in the standings than in scoring has been "lucky".
 */
export function calculateLuckRating(stat: TeamStat): LuckRating {
  const luckScore = stat.pointsForRank - stat.standingsRank;
  let rating: string;
  let line: string;
  if (luckScore >= 3) {
    rating = 'Extremely lucky 🍀';
    line = 'The football gods are clearly on your payroll.';
  } else if (luckScore >= 1) {
    rating = 'Lucky 🙂';
    line = 'Winning more than your scoreboard deserves. Enjoy it.';
  } else if (luckScore === 0) {
    rating = 'Perfectly balanced ⚖️';
    line = 'Your record matches your scoring. No complaints allowed.';
  } else if (luckScore >= -2) {
    rating = 'Unlucky 😕';
    line = 'You score points but the schedule keeps biting you.';
  } else {
    rating = 'Cursed 💀';
    line = 'You deserve better. Truly a victim of the schedule.';
  }
  return {
    standingsRank: stat.standingsRank,
    pointsForRank: stat.pointsForRank,
    luckScore,
    rating,
    line,
  };
}

export interface PanicMeter {
  percent: number;
  level: string;
  line: string;
}

/**
 * A playful 0–100 panic level from record, scoring rank, and point
 * differential. Never mean-spirited.
 */
export function calculatePanicMeter(stat: TeamStat, totalTeams: number): PanicMeter {
  const games = stat.wins + stat.losses + stat.ties;
  const lossRate = games > 0 ? stat.losses / games : 0;
  const rankFactor = totalTeams > 1 ? (stat.pointsForRank - 1) / (totalTeams - 1) : 0;
  const diffFactor = stat.pointDiff < 0 ? 1 : 0;

  const raw = 100 * (0.5 * lossRate + 0.35 * rankFactor + 0.15 * diffFactor);
  const percent = Math.max(0, Math.min(100, Math.round(raw)));

  let level: string;
  let line: string;
  if (percent <= 20) {
    level = 'Chilling 😎';
    line = 'Everything is fine. Keep doing what you are doing.';
  } else if (percent <= 40) {
    level = 'Minor concern 🤔';
    line = 'A small itch of worry, nothing a good week cannot fix.';
  } else if (percent <= 60) {
    level = 'Nervous 😬';
    line = 'Might be time to check the waiver wire a little more often.';
  } else if (percent <= 80) {
    level = 'Panic mode 😱';
    line = 'Refreshing the standings every five minutes energy.';
  } else {
    level = 'Emergency meeting 🚨';
    line = 'Consider trading, praying, or both. Preferably both.';
  }
  return { percent, level, line };
}

/** Randomly selects one team from a league. */
export async function pickRandomTeam(leagueId: string): Promise<ManagerEntry | null> {
  const managers = await getManagers(leagueId);
  if (managers.length === 0) return null;
  return managers[Math.floor(Math.random() * managers.length)];
}

const GENERIC_JOKES = [
  'Your bench might need its own motivational speaker.',
  'This lineup has "projected points merchant" energy.',
  'Your waiver wire history deserves a documentary.',
  'Bold strategy leaving all those points on the bench every week.',
  'Your draft board and reality have never once been introduced.',
];

const LOSING_JOKES = [
  'The good news: it can only go up from here. Probably.',
  'Your team plays every week like it is a bye week.',
  'Even the autodraft feels bad for you.',
];

const WINNING_JOKES = [
  'Sure, you are winning, but at what cost to everyone else’s fun?',
  'Enjoy the top of the standings while the schedule looks the other way.',
  'Winning ugly is still a personality trait, apparently.',
];

const LOW_SCORING_JOKES = [
  'Your offense has taken a vow of silence.',
  'Points are optional, I see.',
  'That score would lose in most other leagues too.',
];

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Picks a light joke, biased by team performance when available.
 * Falls back to generic jokes when there is no data.
 */
export function generateTrashTalk(stat: TeamStat | null, totalTeams: number): string {
  if (!stat) return pick(GENERIC_JOKES);

  const games = stat.wins + stat.losses + stat.ties;
  const losing = games > 0 && stat.losses > stat.wins;
  const winning = games > 0 && stat.wins > stat.losses;
  const lowScoring = totalTeams > 1 && stat.pointsForRank > totalTeams / 2;

  const pool: string[] = [...GENERIC_JOKES];
  if (losing) pool.push(...LOSING_JOKES);
  if (winning) pool.push(...WINNING_JOKES);
  if (lowScoring) pool.push(...LOW_SCORING_JOKES);
  return pick(pool);
}
