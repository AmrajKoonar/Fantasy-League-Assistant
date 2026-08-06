import { supabase } from '../supabaseClient';
import type { DraftGradeRow, InsertDraftGradeInput } from '../../types/database';
import { logger } from '../../utils/logger';

const TABLE = 'draft_grades';

function throwDbError(context: string, message: string): never {
  logger.error(`${context}: ${message}`);
  throw new Error('Draft grade database operation failed');
}

export async function insertDraftGrade(input: InsertDraftGradeInput): Promise<DraftGradeRow> {
  const { data, error } = await supabase.from(TABLE).insert(input).select().single();
  if (error) throwDbError('Failed to insert draft grades', error.message);
  return data as DraftGradeRow;
}

export async function getLatestDraftGrade(
  guildId: string,
  leagueId: string,
): Promise<DraftGradeRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('guild_id', guildId)
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwDbError('Failed to read latest draft grades', error.message);
  return data as DraftGradeRow | null;
}
