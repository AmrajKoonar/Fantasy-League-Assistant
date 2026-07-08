import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env';

/**
 * Server-side Supabase client using the service role key.
 * This bypasses RLS, so it must never be exposed to clients.
 */
export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
