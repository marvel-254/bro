import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, DeviceEventEmitter, type AppStateStatus } from 'react-native';
import { getSupabase } from './supabase';
import { persistPresence, type Presence } from './presence';
import type { User } from '../types';

/**
 * Owns the caller's presence for the whole app session.
 *
 * Lifecycle rules:
 *   - foreground + recent interaction -> online
 *   - foreground but idle past IDLE_AFTER -> afk
 *   - background                  -> offline
 *
 * The row on `profiles` is the durable record; the live broadcast roster is
 * handled per conversation by watchPresence.
 */

/** Idle time before a foreground user is considered afk. */
export const IDLE_AFTER_MS = 90_000;

/** How long to wait after backgrounding before declaring offline. */
const BACKGROUND_GRACE_MS = 15_000;

interface PresenceState {
  presence: Presence;
  statusText: string | null;
  emoji: string | null;
  setPresence: (presence: Presence, options?: { text?: string; emoji?: string }) => Promise<void>;
  isBusy: boolean;
}

const PresenceContext = createContext<PresenceState | null>(null);

export function usePresence(): PresenceState {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    throw new Error('usePresence must be used within PresenceProvider');
  }
  return ctx;
}

export function PresenceProvider({
  user,
  children,
}: {
  user: User | null;
  children: ReactNode;
}) {
  const [presence, setPresenceState] = useState<Presence>('offline');
  const [statusText, setStatusText] = useState<string | null>(null);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const lastInteraction = useRef<number>(Date.now());
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Manual presence wins over the automatic online/afk cycling.
  const manual = useRef<Presence | null>(null);

  const applyPresence = useCallback(
    async (next: Presence, text?: string | null, nextEmoji?: string | null) => {
      setPresenceState(next);
      if (text !== undefined) setStatusText(text);
      if (nextEmoji !== undefined) setEmoji(nextEmoji);
      await persistPresence(next, text ?? statusText ?? undefined, nextEmoji ?? emoji ?? undefined);
    },
    [statusText, emoji],
  );

  // Clear the idle timer whenever presence is set explicitly.
  const armIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
    }
    if (!user) {
      return;
    }
    idleTimer.current = setTimeout(() => {
      if (manual.current === null && AppState.currentState === 'active') {
        void applyPresence('afk');
      }
    }, IDLE_AFTER_MS);
  }, [user, applyPresence]);

  // Sign in / sign out drives presence.
  useEffect(() => {
    if (!user) {
      manual.current = null;
      setPresenceState('offline');
      setStatusText(null);
      setEmoji(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const supabase = getSupabase();
      if (!supabase || cancelled) return;

      const { data } = await supabase
        .from('profiles')
        .select('presence, presence_text, presence_emoji')
        .eq('id', user.id)
        .maybeSingle<{
          presence: Presence;
          presence_text: string | null;
          presence_emoji: string | null;
        }>();

      if (cancelled || !data) return;
      setStatusText(data.presence_text);
      setEmoji(data.presence_emoji);

      // Coming back to a backgrounded session always resumes as online.
      if (AppState.currentState === 'active') {
        setPresenceState('online');
        void persistPresence('online', data.presence_text ?? undefined, data.presence_emoji ?? undefined);
      }
    })();

    armIdleTimer();
    return () => {
      cancelled = true;
    };
  }, [user, armIdleTimer]);

  // Foreground / background transitions.
  useEffect(() => {
    if (!user) {
      return;
    }

    const onChange = (next: AppStateStatus) => {
      if (backgroundTimer.current) {
        clearTimeout(backgroundTimer.current);
        backgroundTimer.current = null;
      }

      if (next === 'active') {
        lastInteraction.current = Date.now();
        manual.current = null;
        void applyPresence('online');
        armIdleTimer();
        return;
      }

      // Do not immediately mark offline: a quick app switch (permission
      // prompt, control centre) should not flip the dot.
      backgroundTimer.current = setTimeout(() => {
        manual.current = null;
        void applyPresence('offline');
      }, BACKGROUND_GRACE_MS);
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => {
      subscription.remove();
      if (backgroundTimer.current) {
        clearTimeout(backgroundTimer.current);
      }
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
    };
  }, [user, applyPresence, armIdleTimer]);

  // Touch anywhere counts as activity.
  useEffect(() => {
    if (!user) {
      return;
    }

    const markActive = () => {
      lastInteraction.current = Date.now();
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
      if (presence === 'afk' && manual.current === null) {
        void applyPresence('online');
      }
      armIdleTimer();
    };

    const emitter = DeviceEventEmitter;
    const subscription = emitter.addListener('presenceActivity', markActive);
    return () => subscription.remove();
  }, [user, presence, applyPresence, armIdleTimer]);

  const setPresence = useCallback(
    async (next: Presence, options?: { text?: string; emoji?: string }) => {
      setIsBusy(true);
      try {
        // Choosing a non-default state pins it until the app is backgrounded.
        manual.current = next === 'online' ? null : next;
        await applyPresence(next, options?.text ?? null, options?.emoji ?? null);
        if (next === 'online') {
          armIdleTimer();
        }
      } finally {
        setIsBusy(false);
      }
    },
    [applyPresence, armIdleTimer],
  );

  const value = useMemo<PresenceState>(
    () => ({ presence, statusText, emoji, setPresence, isBusy }),
    [presence, statusText, emoji, setPresence, isBusy],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}