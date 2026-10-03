import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { type User } from '../types';
import { getSupabase, isSupabaseConfigured } from './supabase';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  setUser: (user: User | null) => void;
  clearError: () => void;
  /** True when sign-up created an account that still needs email confirmation. */
  awaitingEmailConfirmation: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Map a Supabase auth user onto the app's User shape. */
function toBroUser(supabaseUser: SupabaseUser): User {
  const email = supabaseUser.email ?? '';
  const fallback = email.split('@')[0] || 'user';
  const meta = supabaseUser.user_metadata ?? {};

  return {
    id: supabaseUser.id,
    username: (meta.username as string | undefined) ?? fallback,
    displayName: (meta.display_name as string | undefined) ?? (meta.full_name as string | undefined) ?? fallback,
    avatar: (meta.avatar_url as string | undefined),
    bio: (meta.bio as string | undefined) ?? undefined,
    status: 'online',
    isVerified: Boolean(supabaseUser.email_confirmed_at),
    createdAt: supabaseUser.created_at ?? new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);
  const [overrideUser, setOverrideUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      // Without env vars there is no session to restore; fail closed.
      setIsLoading(false);
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session ?? null);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
      if (nextSession) {
        setAwaitingEmailConfirmation(false);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInFunc = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Backend not configured');
    }

    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      throw new Error(signInError.message);
    }
  }, []);

  const signUpFunc = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Backend not configured');
    }

    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
      throw new Error(signUpError.message);
    }

    // Supabase returns a user but no session when email confirmation is on.
    if (!data.session) {
      setAwaitingEmailConfirmation(true);
    }
  }, []);

  const signOutFunc = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      throw new Error(signOutError.message);
    }
    setOverrideUser(null);
  }, []);

  const verifyEmailFunc = useCallback(async (code: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Backend not configured');
    }

    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: session?.user?.email ?? '',
      token: code,
      type: 'email',
    });

    if (verifyError) {
      setError(verifyError.message);
      throw new Error(verifyError.message);
    }
    setAwaitingEmailConfirmation(false);
  }, [session?.user?.email]);

  const clearErrorFunc = useCallback(() => {
    setError(null);
  }, []);

  const user = overrideUser ?? (session?.user ? toBroUser(session.user) : null);
  const isConfigured = isSupabaseConfigured;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(session) && isConfigured,
        error,
        awaitingEmailConfirmation,
        signIn: signInFunc,
        signUp: signUpFunc,
        signOut: signOutFunc,
        verifyEmail: verifyEmailFunc,
        setUser: setOverrideUser,
        clearError: clearErrorFunc,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}