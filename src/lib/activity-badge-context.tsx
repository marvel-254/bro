import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { fetchUnreadActivityCount, subscribeToActivity } from './activity';
import { isSupabaseConfigured } from './supabase';

/**
 * Unread activity count, shared so any entry point (tab, header icon) can show
 * the same badge without each screen polling on its own.
 *
 * Mounted once near the root. The count refreshes on notification realtime
 * events and whenever `refresh()` is called, e.g. after opening the screen.
 */

interface ActivityBadgeState {
  unreadCount: number;
  refresh: () => Promise<void>;
}

const ActivityBadgeContext = createContext<ActivityBadgeState | null>(null);

export function useActivityBadge(): ActivityBadgeState {
  const ctx = useContext(ActivityBadgeContext);
  if (!ctx) {
    throw new Error('useActivityBadge must be used within ActivityBadgeProvider');
  }
  return ctx;
}

export function ActivityBadgeProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) {
      setUnreadCount(0);
      return;
    }
    setUnreadCount(await fetchUnreadActivityCount());
  }, [userId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setUnreadCount(0);
      return;
    }

    void refresh();
    const unsubscribe = subscribeToActivity({ onChange: () => void refresh() });
    return unsubscribe;
  }, [refresh, userId]);

  return (
    <ActivityBadgeContext.Provider value={{ unreadCount, refresh }}>
      {children}
    </ActivityBadgeContext.Provider>
  );
}