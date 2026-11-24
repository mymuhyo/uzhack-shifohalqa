import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
  if (typeof window !== 'undefined') {
    throw new Error('createSupabaseAdminClient() is server-only and cannot be used in a browser environment.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
