import * as sleeperApi from './sleeperApi';
import { Messages, UserFacingError } from '../utils/errors';
import type { SleeperLeague } from '../types/sleeper';

/** Human-friendly waiver type from Sleeper's numeric setting. */
export function waiverTypeLabel(type: number | undefined): string {
  switch (type) {
    case 0:
      return 'Rolling waivers';
    case 1:
      return 'Reverse standings waivers';
    case 2:
      return 'FAAB (Free Agent Acquisition Budget)';
    default:
      return 'Unknown';
  }
}

/** Scoring type derived from the reception setting. */
export function scoringTypeLabel(league: SleeperLeague): string {
  const rec = league.scoring_settings?.rec;
  if (rec === 1) return 'PPR';
  if (rec === 0.5) return 'Half PPR';
  if (rec === undefined || rec === 0) return 'Standard';
  return `${rec} per reception`;
}

export interface LeagueSettingsView {
  name: string;
  season: string;
  status: string;
  totalRosters: string;
  rosterPositions: string;
  scoringType: string;
  playoffTeams: string;
  playoffWeekStart: string;
  tradeDeadline: string;
  waiverType: string;
  faab: string;
  benchSlots: string;
  irSlots: string;
  taxiSlots: string;
  draftId: string;
  previousLeagueId: string;
}

/** Builds a display-ready settings view, gracefully handling missing fields. */
export async function getLeagueSettings(leagueId: string): Promise<LeagueSettingsView> {
  const league = await sleeperApi.getLeague(leagueId);
  if (!league) throw new UserFacingError(Messages.genericFailure);

  const settings = league.settings ?? {};
  const positions = league.roster_positions ?? [];
  const benchSlots = positions.filter((p) => p === 'BN').length;
  const faabBudget = settings.waiver_budget;

  return {
    name: league.name ?? '—',
    season: league.season ?? '—',
    status: league.status ?? '—',
    totalRosters: String(league.total_rosters ?? '—'),
    rosterPositions: positions.length ? positions.join(', ') : '—',
    scoringType: scoringTypeLabel(league),
    playoffTeams: settings.playoff_teams !== undefined ? String(settings.playoff_teams) : '—',
    playoffWeekStart:
      settings.playoff_week_start !== undefined ? String(settings.playoff_week_start) : '—',
    tradeDeadline: settings.trade_deadline !== undefined ? String(settings.trade_deadline) : '—',
    waiverType: waiverTypeLabel(settings.waiver_type),
    faab: typeof faabBudget === 'number' && faabBudget > 0 ? `$${faabBudget}` : '—',
    benchSlots: benchSlots > 0 ? String(benchSlots) : '—',
    irSlots: settings.reserve_slots !== undefined ? String(settings.reserve_slots) : '—',
    taxiSlots: settings.taxi_slots !== undefined ? String(settings.taxi_slots) : '—',
    draftId: league.draft_id ?? '—',
    previousLeagueId: league.previous_league_id ?? '—',
  };
}

/** Labels for common Sleeper scoring keys; unknown keys fall back to the raw key. */
const SCORING_LABELS: Record<string, string> = {
  rec: 'Reception',
  rec_yd: 'Receiving yards',
  rec_td: 'Receiving TD',
  rush_yd: 'Rushing yards',
  rush_td: 'Rushing TD',
  pass_yd: 'Passing yards',
  pass_td: 'Passing TD',
  pass_int: 'Interception thrown',
  fum_lost: 'Fumble lost',
  fum: 'Fumble',
  fgm: 'Field goal made',
  fgmiss: 'Field goal missed',
  xpm: 'Extra point made',
  bonus_rec_te: 'TE reception bonus',
  pts_allow: 'Points allowed (DEF)',
  sack: 'Sack (DEF)',
  int: 'Interception (DEF)',
  def_td: 'Defensive TD',
  ff: 'Forced fumble',
  fum_rec: 'Fumble recovery',
  safe: 'Safety',
};

export interface ScoringLine {
  label: string;
  value: number;
}

export interface ScoringView {
  name: string;
  lines: ScoringLine[];
}

/** Returns formatted scoring settings, most impactful keys first. */
export async function getScoring(leagueId: string): Promise<ScoringView> {
  const league = await sleeperApi.getLeague(leagueId);
  if (!league) throw new UserFacingError(Messages.genericFailure);

  const scoring = league.scoring_settings ?? {};
  const entries = Object.entries(scoring);

  const lines: ScoringLine[] = entries
    .map(([key, value]) => ({
      label: SCORING_LABELS[key] ?? key,
      value,
      known: key in SCORING_LABELS,
    }))
    // Known/common settings first, then alphabetical by label.
    .sort((a, b) => {
      if (a.known !== b.known) return a.known ? -1 : 1;
      return a.label.localeCompare(b.label);
    })
    .map(({ label, value }) => ({ label, value }));

  return { name: league.name ?? '—', lines };
}
