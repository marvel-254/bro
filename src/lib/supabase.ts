import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Session storage: the refresh token lives in the hardware-backed keystore,
 * not in a plaintext SQLite file. expo-secure-store is async-only while
 * supabase-js expects a synchronous-ish Storage interface, so every method
 * returns a promise — which the client supports.
 *
 * Large non-secret values (future cache use) should keep using AsyncStorage;
 * only the auth session goes through here.
 */
const secureSessionStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Storage-full or locked keystore: the session simply will not persist.
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Already gone is fine.
    }
  },
};

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
      // The session (including the refresh token) lives in the hardware-backed
      // keystore, not in a plaintext file. React Native has no
      // window.localStorage; this adapter stands in for it.
      storage: secureSessionStorage,
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
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return instance;
}

export type { SupabaseClient };
