import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for BRO.
 *
 * Identity is owned by Clerk. The Clerk session token is passed through as the
 * Supabase access token, so Postgres sees auth.uid() equal to the Clerk user id
 * and the RLS policies in supabase/migrations apply unchanged.
 *
 * Required env vars (see .env.example):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

type TokenProvider = () => Promise<string | null>;

let tokenProvider: TokenProvider | null = null;

/**
 * Wire the Clerk token getter in once, from the auth layer. Kept separate from
 * module init so the client is not rebuilt when auth state changes.
 */
export function setSupabaseTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

function createSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }

  return createClient(supabaseUrl as string, supabaseAnonKey as string, {
    auth: {
      // Clerk owns the session; Supabase must not persist or refresh it.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    accessToken: async () => {
      if (!tokenProvider) {
        return null;
      }
      return tokenProvider();
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