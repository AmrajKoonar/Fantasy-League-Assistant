/**
 * Central command registry. To add a new command:
 * 1. Create a file in src/commands that default-exports a BotCommand.
 * 2. Import it here and add it to the array below.
 * Both the bot (index.ts) and the deploy script pick it up automatically.
 */

import type { BotCommand } from '../types/commands';

import ping from './ping';
import linkSleeper from './linkSleeper';
import me from './me';
import addLeague from './addLeague';
import removeLeague from './removeLeague';
import setDefaultLeague from './setDefaultLeague';
import leagues from './leagues';
import leagueInfo from './leagueInfo';
import standings from './standings';
import matchups from './matchups';
import roster from './roster';
import transactions from './transactions';
import trending from './trending';
import player from './player';

export const commands: BotCommand[] = [
  ping,
  linkSleeper,
  me,
  addLeague,
  removeLeague,
  setDefaultLeague,
  leagues,
  leagueInfo,
  standings,
  matchups,
  roster,
  transactions,
  trending,
  player,
];
