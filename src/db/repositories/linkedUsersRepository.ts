import { supabase } from '../supabaseClient';
import type { LinkedUserRow, UpsertLinkedUserInput } from '../../types/database';
import { logger } from '../../utils/logger';

const TABLE = 'linked_users';

/** Returns the linked Sleeper account for a Discord user, or null. */
export async function getLinkedUser(discordUserId: string): Promise<LinkedUserRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();

  if (error) {
    logger.error(`Failed to fetch linked user ${discordUserId}: ${error.message}`);
    throw new Error(`Database error while fetching linked user: ${error.message}`);
  }
  return data as LinkedUserRow | null;
}

/**
 * Creates or updates the Discord -> Sleeper link for a user.
 * Users link once globally; re-linking overwrites the previous mapping.
 */
export async function upsertLinkedUser(input: UpsertLinkedUserInput): Promise<LinkedUserRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(input, { onConflict: 'discord_user_id' })
    .select()
    .single();

  if (error) {
    logger.error(`Failed to upsert linked user ${input.discord_user_id}: ${error.message}`);
    throw new Error(`Database error while linking account: ${error.message}`);
  }
  return data as LinkedUserRow;
}
