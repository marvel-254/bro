import { getSupabase } from './supabase';
import type { Presence } from './presence';

/**
 * Activity — replies, mentions, reactions, joins, invites and follows that are
 * relevant to you.
 *
 * This reads `notifications`, NOT `activity` directly. Two reasons:
 *
 *   1. `notifications` is scoped with `user_id = auth.uid()`, so it can only
 *      ever return your own rows. Reading `activity` would need a broad policy,
 *      which is exactly the leak migration 004 closed.
 *   2. `notifications.deep_link` already carries where to go, so the client does
 *      not have to re-derive a destination from target ids.
 *
 * The fan-out that populates these rows is the `activity_fan_out` trigger in
 * migration 004, so activity appears here the moment it happens.
 */

export type ActivityType = 'reply' | 'mention' | 'reaction' | 'join' | 'invite' | 'follow';

export interface ActivityItem {
  notificationId: string;
  activityId: string;
  type: ActivityType;
  actorId: string;
  actorName: string;
  actorAvatarUrl: string | null;
  actorPresence: Presence | null;
  /** Raw target id, kept so the UI can resolve a conversation when needed. */
  targetId: string | null;
  targetType: 'conversation' | 'message' | 'space' | 'user' | null;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string;
}

export const ACTIVITY_PAGE_SIZE = 30;

/** Short, plain-English lines. No slang here — these can be about other people. */
export function describeActivity(
  type: ActivityType,
  actorName: string,
  targetType: ActivityItem['targetType'],
): string {
  switch (type) {
    case 'reply':
      return `${actorName} replied to you`;
    case 'mention':
      return `${actorName} mentioned you`;
    case 'reaction':
      return `${actorName} reacted to your message`;
    case 'join':
      return targetType === 'space'
        ? `${actorName} joined your space`
        : `${actorName} joined`;
    case 'invite':
      return `${actorName} invited you`;
    case 'follow':
      return `${actorName} followed you`;
    default:
      return `${actorName} did something`;
  }
}

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Your activity feed, newest first. `before` paginates by cursor on created_at
 * rather than by offset, so new rows arriving mid-scroll cannot shift the page.
 */
export async function fetchActivity(
  before?: string,
  limit: number = ACTIVITY_PAGE_SIZE,
): Promise<ActivityItem[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('notifications')
    .select(
      'id, activity_id, is_read, deep_link, created_at, activity:activity!inner (id, type, actor_id, target_id, target_type, actor:profiles!activity_actor_id_fkey (id, display_name, avatar_url, presence))',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as Array<{
    id: string;
    activity_id: string;
    is_read: boolean;
    deep_link: string | null;
    created_at: string;
    activity: {
      id: string;
      type: ActivityType;
      actor_id: string;
      target_id: string | null;
      target_type: ActivityItem['targetType'];
      actor: {
        id: string;
        display_name: string;
        avatar_url: string | null;
        presence: Presence | null;
      } | null;
    } | null;
  }>)
    .filter((row) => row.activity !== null)
    .map((row) => ({
      notificationId: row.id,
      activityId: row.activity_id,
      type: row.activity!.type,
      actorId: row.activity!.actor_id,
      // The actor row can be null if the profile was deleted in between; the
      // cascade should prevent it, but never render a blank name.
      actorName: row.activity!.actor?.display_name ?? 'Someone',
      actorAvatarUrl: row.activity!.actor?.avatar_url ?? null,
      actorPresence: row.activity!.actor?.presence ?? null,
      targetId: row.activity!.target_id,
      targetType: row.activity!.target_type,
      deepLink: row.deep_link,
      isRead: row.is_read,
      createdAt: row.created_at,
    }));
}

/** Unread count for the badge. Cheap: PostgREST returns the count in the header. */
export async function fetchUnreadActivityCount(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) {
    return 0;
  }

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error) {
    // A badge is not worth surfacing an error for.
    return 0;
  }
  return count ?? 0;
}

/** Mark specific notifications read. Only your own rows can be updated (RLS). */
export async function markActivityRead(notificationIds: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || notificationIds.length === 0) {
    return;
  }

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .in('id', notificationIds);
}

/** Mark everything read. */
export async function markAllActivityRead(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
}

/**
 * Record an activity event. The fan-out trigger turns this into notifications
 * for the right people, so callers only describe what happened.
 *
 * The actor is always taken from the session, never from the argument.
 */
export async function recordActivity(input: {
  type: ActivityType;
  targetId?: string | null;
  targetType?: ActivityItem['targetType'];
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const actorId = userData.user?.id;
  if (!actorId) {
    return;
  }

  await supabase.from('activity').insert({
    type: input.type,
    actor_id: actorId,
    target_id: input.targetId ?? null,
    target_type: input.targetType ?? null,
  });
}

/** Live updates so the feed and badge do not go stale. */
export function subscribeToActivity(handlers: { onChange: () => void }): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel('activity')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      () => handlers.onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}