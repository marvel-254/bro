import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for BRO.
 *
 * Supabase owns identity as well as data: the session is persisted locally and
 * refreshed automatically, and Postgres resolves the caller through
 * auth.uid(), so the RLS policies in supabase/migrations apply unchanged.
 *
 * Required env vars (see .env.example):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function createSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }

  return createClient(supabaseUrl as string, supabaseAnonKey as string, {
    auth: {
      // React Native has no window.localStorage; AsyncStorage stands in for it.
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

let client: SupabaseClient | null = createSupabaseClient();

/**
 * Returns the shared client, or null when Supabase env vars are absent. Callers
 * should treat null as "backend unavailable" rather than crashing the screen.
 */
export function getSupabase(): SupabaseClient | null {
  if (!client) {
    client = createSupabaseClient();
  }
  return client;
}

export function requireSupabase(): SupabaseClient {
  const instance = getSupabase();
  if (!instance) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return instance;
}

export type { SupabaseClient };