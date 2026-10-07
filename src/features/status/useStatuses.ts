import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchStatuses, groupStatuses, type StatusGroup } from "../../lib/statuses";

/** Where "seen" state lives between launches. */
const STORAGE_KEY = "bro:seen-statuses";

type Args = {
  viewerId: string | null;
  /** Skip the network entirely when nobody is signed in. */
  enabled?: boolean;
};

export type StatusState = {
  groups: StatusGroup[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  markSeen: (ids: string[]) => void;
};

/**
 * Loads active statuses and remembers which ones have been viewed.
 *
 * "Seen" is intentionally session-local rather than a server round trip: it is
 * a per-device presentation detail, and writing every view to the database
 * would turn a scroll into a stream of writes.
 */
export function useStatuses({ viewerId, enabled = true }: Args): StatusState {
  const [updates, setUpdates] = useState<
    Awaited<ReturnType<typeof fetchStatuses>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(new Set());
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      if (!cancelled && Array.isArray(parsed)) {
        setSeenIds(new Set(parsed));
      }
    } catch {
      // A corrupt cache is not worth surfacing; start unseen.
    }
    hydrated.current = true;
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const rows = await fetchStatuses();
      setUpdates(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load statuses");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  const markSeen = useCallback((ids: string[]) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Best effort: seen state is a nicety, never a correctness issue.
      }
      return next;
    });
  }, []);

  const groups = useMemo(
    () => groupStatuses(updates, viewerId, seenIds),
    [updates, viewerId, seenIds],
  );

  return { groups, loading, error, reload, markSeen };
}
