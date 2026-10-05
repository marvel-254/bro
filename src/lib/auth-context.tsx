import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { type User } from "../types";
import { getSupabase, isSupabaseConfigured } from "./supabase";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  updateProfile: (profile: {
    displayName?: string;
    username?: string;
    avatar?: string;
    bio?: string;
    interests?: string[];
  }) => Promise<void>;
  setUser: (user: User | null) => void;
  clearError: () => void;
  /** True when sign-up created an account that still needs email confirmation. */
  awaitingEmailConfirmation: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Map a Supabase auth user onto the app's User shape. */
function toBroUser(supabaseUser: SupabaseUser): User {
  const email = supabaseUser.email ?? "";
  const fallback = email.split("@")[0] || "user";
  const meta = supabaseUser.user_metadata ?? {};

  return {
    id: supabaseUser.id,
    username: (meta.username as string | undefined) ?? fallback,
    displayName:
      (meta.display_name as string | undefined) ??
      (meta.full_name as string | undefined) ??
      fallback,
    avatar: meta.avatar_url as string | undefined,
    bio: (meta.bio as string | undefined) ?? undefined,
    interests: Array.isArray(meta.interests)
      ? (meta.interests as string[])
      : undefined,
    status: "online",
    isVerified: Boolean(supabaseUser.email_confirmed_at),
    createdAt: supabaseUser.created_at ?? new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] =
    useState(false);
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

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setIsLoading(false);
        if (nextSession) {
          setAwaitingEmailConfirmation(false);
        }
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInFunc = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Backend not configured");
    }

    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      throw new Error(signInError.message);
    }
  }, []);

  const signUpFunc = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Backend not configured");
    }

    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      throw new Error(signUpError.message);
    }

    // Supabase returns a user but no session when email confirmation is on.
    // Return it directly: reading the awaitingEmailConfirmation flag from a
    // screen closure would see the pre-signup render's stale value.
    const needsConfirmation = !data.session;
    if (needsConfirmation) {
      setAwaitingEmailConfirmation(true);
    }
    return needsConfirmation;
  }, []);

  const signOutFunc = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      return;
    }

    // Mark offline BEFORE the session dies: afterwards this write is anonymous
    // and RLS rejects it. Best-effort — a failure here must never block leaving.
    // (A force-quit cannot do even this; that case stays visible until the
    // next presence write. There is deliberately no server-side reaper yet.)
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase
          .from("profiles")
          .update({ presence: "offline", presence_text: null, presence_emoji: null })
          .eq("id", data.user.id);
      }
    } catch {
      // Leaving matters more than the dot.
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      throw new Error(signOutError.message);
    }
    setOverrideUser(null);
  }, []);

  const verifyEmailFunc = useCallback(
    async (code: string) => {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error("Backend not configured");
      }

      setError(null);
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: session?.user?.email ?? "",
        token: code,
        type: "email",
      });

      if (verifyError) {
        setError(verifyError.message);
        throw new Error(verifyError.message);
      }
      setAwaitingEmailConfirmation(false);
    },
    [session?.user?.email],
  );

  const updateProfileFunc = useCallback(
    async (profileData: {
      displayName?: string;
      username?: string;
      avatar?: string;
      bio?: string;
      interests?: string[];
    }) => {
      const supabase = getSupabase();
      if (supabase) {
        // Both writes are checked. The old code destructured nothing, so an
        // RLS rejection affected zero rows invisibly and the screen navigated
        // on as if the save had worked.
        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            display_name: profileData.displayName,
            username: profileData.username,
            avatar_url: profileData.avatar,
            bio: profileData.bio,
            interests: profileData.interests,
          },
        });
        if (metadataError) {
          setError(metadataError.message);
          throw new Error(metadataError.message);
        }

        const uid = session?.user?.id;
        if (uid) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({
              display_name: profileData.displayName,
              username: profileData.username,
              avatar_url: profileData.avatar,
              bio: profileData.bio,
            })
            .eq("id", uid);
          if (profileError) {
            setError(profileError.message);
            throw new Error(profileError.message);
          }
        }
      }

      setOverrideUser((prev) => {
        const base =
          prev ??
          (session?.user
            ? toBroUser(session.user)
            : {
                id: session?.user?.id ?? "temp-user",
                username: profileData.username ?? "user",
                displayName: profileData.displayName ?? "User",
                isVerified: false,
                createdAt: new Date().toISOString(),
              });
        return {
          ...base,
          displayName: profileData.displayName ?? base.displayName,
          username: profileData.username ?? base.username,
          avatar: profileData.avatar ?? base.avatar,
          bio: profileData.bio ?? base.bio,
          interests: profileData.interests ?? base.interests,
        };
      });
    },
    [session],
  );

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
        updateProfile: updateProfileFunc,
        setUser: setOverrideUser,
        clearError: clearErrorFunc,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
