/**
 * Central command registry. To add a new command:
 * 1. Create a file in src/commands that default-exports a BotCommand.
 * 2. Import it here and add it to the array below.
 * Both the bot (index.ts) and the deploy script pick it up automatically.
 */

import type { BotCommand } from '../types/commands';

import ping from './ping';
import help from './help';
import currentWeek from './currentWeek';

import linkSleeper from './linkSleeper';
import me from './me';
import myLeagues from './myLeagues';

import addLeague from './addLeague';
import removeLeague from './removeLeague';
import setDefaultLeague from './setDefaultLeague';

import leagues from './leagues';
import leagueInfo from './leagueInfo';
import leagueSettings from './leagueSettings';
import scoring from './scoring';
import managers from './managers';
import standings from './standings';
import powerRankings from './powerRankings';
import leagueRecords from './leagueRecords';

import matchups from './matchups';
import matchupDetail from './matchupDetail';
import weeklyRecap from './weeklyRecap';
import biggestBlowout from './biggestBlowout';
import closestMatchup from './closestMatchup';

import roster from './roster';
import team from './team';
import record from './record';
import moves from './moves';
import faab from './faab';
import waiverOrder from './waiverOrder';

import draft from './draft';
import draftOrder from './draftOrder';
import draftResults from './draftResults';
import tradedPicks from './tradedPicks';
import playoffBracket from './playoffBracket';

import transactions from './transactions';
import tradeHistory from './tradeHistory';
import waiverHistory from './waiverHistory';
import trade from './trade';
import counteroffer from './counteroffer';
import tradeHistoryLocal from './tradeHistoryLocal';

import player from './player';
import trending from './trending';

import draftReminder from './draftReminder';
import waiversReminder from './waiversReminder';

import luckRating from './luckRating';
import panicMeter from './panicMeter';
import benchwarmer from './benchwarmer';
import randomTeam from './randomTeam';
import trashTalk from './trashTalk';

export const commands: BotCommand[] = [
  // General
  ping,
  help,
  currentWeek,
  // Account
  linkSleeper,
  me,
  myLeagues,
  // League management (owner only)
  addLeague,
  removeLeague,
  setDefaultLeague,
  // League info
  leagues,
  leagueInfo,
  leagueSettings,
  scoring,
  managers,
  standings,
  powerRankings,
  leagueRecords,
  // Matchups
  matchups,
  matchupDetail,
  weeklyRecap,
  biggestBlowout,
  closestMatchup,
  // Teams
  roster,
  team,
  record,
  moves,
  faab,
  waiverOrder,
  // Draft
  draft,
  draftOrder,
  draftResults,
  tradedPicks,
  playoffBracket,
  // Transactions
  transactions,
  tradeHistory,
  waiverHistory,
  trade,
  counteroffer,
  tradeHistoryLocal,
  // Players
  player,
  trending,
  // Reminders (owner only)
  draftReminder,
  waiversReminder,
  // Fun
  luckRating,
  panicMeter,
  benchwarmer,
  randomTeam,
  trashTalk,
];
