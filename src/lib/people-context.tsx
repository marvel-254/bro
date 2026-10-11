import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getSupabase } from "./supabase";
import type { Presence } from "./presence";

/**
 * Roster of everyone on the platform, along with their presence.
 *
 * The `profiles` table is publicly readable by design (it is the discovery
 * surface), so Who's Around can list every user and their online state
 * without a conversation history between them.
 */

export interface PersonPresence {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  presence: Presence;
  statusText: string | null;
  emoji: string | null;
}

interface PeopleState {
  people: PersonPresence[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const PeopleContext = createContext<PeopleState | null>(null);

export function usePeople(): PeopleState {
  const ctx = useContext(PeopleContext);
  if (!ctx) {
    throw new Error("usePeople must be used within PeopleProvider");
  }
  return ctx;
}

export function PeopleProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [people, setPeople] = useState<PersonPresence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setPeople([]);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("profiles")
      .select(
        `id, username, display_name, avatar_url,
         presence, presence_text, presence_emoji, last_seen_at`,
      )
      .neq("id", userId)
      .order("presence", { ascending: false })
      .limit(500);

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      username: string | null;
      display_name: string;
      avatar_url: string | null;
      presence: Presence;
      presence_text: string | null;
      presence_emoji: string | null;
    }>;

    const mapped: PersonPresence[] = rows.map((profile) => ({
      userId: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      presence: profile.presence ?? "offline",
      statusText: profile.presence_text,
      emoji: profile.presence_emoji,
    }));

    setPeople(mapped);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setPeople([]);
      return;
    }
    void load();

    // Presence changes on other people's profiles must show up without a
    // refresh, so subscribe to the profiles table.
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel("people-presence")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const value = {
    people,
    loading,
    error,
    refresh: load,
  };

  return (
    <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>
  );
}
