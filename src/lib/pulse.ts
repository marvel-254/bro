import { getSupabase } from './supabase';

/**
 * Data access for the Pulse screen.
 *
 * Pulse answers one question — "what is happening right now?" — so every query
 * here is time-bounded rather than a feed. Three strips:
 *
 *   1. Live now    — conversations with a message burst inside a short window.
 *   2. Tap-in      — plans that have not expired, soonest first.
 *   3. Around      — peers with presence; served by people-context, not here.
 *
 * Nothing here is personalised by rank or score: results are ordered by time so
 * Pulse can never decay into an algorithmic feed. RLS still applies, so the
 * caller only ever sees conversations they are a member of.
 */

/** A conversation counts as "live" when it has at least this many messages in the window. */
export const LIVE_MIN_MESSAGES = 2;

/** Default size of the "live" window, in minutes. */
export const LIVE_WINDOW_MINUTES = 15;

export interface PulseLiveConversation {
  conversationId: string;
  type: 'direct' | 'group' | 'space' | 'live';
  name: string | null;
  /** Messages inside the live window. */
  messageCount: number;
  /** Newest message in the window. */
  lastMessageAt: string;
  /** Preview of the newest message in the window. */
  lastMessagePreview: string | null;
  /** Peers in the conversation, for the avatar stack. */
  peers: Array<{
    userId: string;
    displayName: string;
    avatarUrl: string | null;
  }>;
}

export interface PulsePlan {
  id: string;
  creatorId: string;
  creatorName: string | null;
  title: string;
  kind: 'football' | 'outing' | 'meal' | 'event' | 'other' | null;
  startsAt: string;
  location: string | null;
  expiresAt: string | null;
  /** How many people have responded Going / Maybe / Can't. */
  responseCount: number;
  /** How many said Going. */
  goingCount: number;
}

function cutoffIso(windowMinutes: number): string {
  return new Date(Date.now() - windowMinutes * 60_000).toISOString();
}

/**
 * Conversations the caller belongs to that saw a burst of messages inside the
 * window. Returns [] when the backend is unconfigured, when the caller is not
 * signed in, or when they are in no conversations at all.
 */
export async function fetchLiveConversations(
  windowMinutes: number = LIVE_WINDOW_MINUTES,
  limit: number = 10,
): Promise<PulseLiveConversation[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;
  if (!selfId) {
    return [];
  }

  const { data: memberships, error: memberError } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', selfId);

  if (memberError) {
    throw new Error(memberError.message);
  }

  const conversationIds = (memberships ?? []).map(
    (row: { conversation_id: string }) => row.conversation_id,
  );
  if (conversationIds.length === 0) {
    return [];
  }

  // Recent messages, scoped to the caller's conversations. RLS re-checks
  // membership server-side; the id filter here is just to bound the result set.
  const { data: recentRows, error: messageError } = await supabase
    .from('messages')
    .select('id, conversation_id, content, sender_id, created_at')
    .in('conversation_id', conversationIds)
    .gte('created_at', cutoffIso(windowMinutes))
    .order('created_at', { ascending: false })
    .limit(200);

  if (messageError) {
    throw new Error(messageError.message);
  }

  const rows = (recentRows ?? []) as Array<{
    id: string;
    conversation_id: string;
    content: string;
    sender_id: string;
    created_at: string;
  }>;

  // Collapse to one entry per conversation, keeping the newest message. The
  // query is newest-first, so the first row seen for a conversation is its head.
  const byConversation = new Map<string, { count: number; last: (typeof rows)[number] }>();
  for (const row of rows) {
    if (row.sender_id === selfId) continue;
    const existing = byConversation.get(row.conversation_id);
    if (existing) {
      existing.count += 1;
    } else {
      byConversation.set(row.conversation_id, { count: 1, last: row });
    }
  }

  const live = [...byConversation.entries()]
    .filter(([, value]) => value.count >= LIVE_MIN_MESSAGES)
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return Date.parse(b[1].last.created_at) - Date.parse(a[1].last.created_at);
    })
    .slice(0, limit);

  if (live.length === 0) {
    return [];
  }

  const liveIds = live.map(([id]) => id);

  const { data: conversationRows } = await supabase
    .from('conversations')
    .select('id, type, name')
    .in('id', liveIds);

  const typeById = new Map<string, string>();
  const nameById = new Map<string, string | null>();
  for (const row of (conversationRows ?? []) as Array<{
    id: string;
    type: string;
    name: string | null;
  }>) {
    typeById.set(row.id, row.type);
    nameById.set(row.id, row.name);
  }

  // Peers drive the avatar stack. A peer-query failure is non-fatal: the card
  // still renders, just without faces.
  const { data: peerRows } = await supabase
    .from('conversation_members')
    .select(
      'conversation_id, profile:profiles!conversation_members_user_id_fkey (id, display_name, avatar_url)',
    )
    .in('conversation_id', liveIds)
    .neq('user_id', selfId);

  const peersByConversation = new Map<string, PulseLiveConversation['peers']>();
  for (const peer of (peerRows ?? []) as unknown as Array<{
    conversation_id: string;
    profile: { id: string; display_name: string; avatar_url: string | null } | null;
  }>) {
    if (!peer.profile) continue;
    const list = peersByConversation.get(peer.conversation_id) ?? [];
    list.push({
      userId: peer.profile.id,
      displayName: peer.profile.display_name,
      avatarUrl: peer.profile.avatar_url,
    });
    peersByConversation.set(peer.conversation_id, list);
  }

  return live.map(([conversationId, value]) => ({
    conversationId,
    type: (typeById.get(conversationId) as PulseLiveConversation['type']) ?? 'group',
    name: nameById.get(conversationId) ?? null,
    messageCount: value.count,
    lastMessageAt: value.last.created_at,
    lastMessagePreview: value.last.content || null,
    peers: peersByConversation.get(conversationId) ?? [],
  }));
}

/**
 * Plans that have not expired yet, soonest deadline first, with a Going /
 * Maybe tally. Empty is a normal state — nobody has posted a plan.
 */
export async function fetchUpcomingPlans(limit: number = 10): Promise<PulsePlan[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data: planRows, error } = await supabase
    .from('plans')
    .select('id, creator_id, title, kind, starts_at, location, expires_at, created_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const plans = (planRows ?? []) as Array<{
    id: string;
    creator_id: string;
    title: string;
    kind: PulsePlan['kind'];
    starts_at: string;
    location: string | null;
    expires_at: string | null;
    created_at: string;
  }>;

  if (plans.length === 0) {
    return [];
  }

  const planIds = plans.map((plan) => plan.id);

  const { data: responseRows } = await supabase
    .from('plan_responses')
    .select('plan_id, response')
    .in('plan_id', planIds);

  const totals = new Map<string, { total: number; going: number }>();
  for (const row of (responseRows ?? []) as Array<{ plan_id: string; response: string }>) {
    const entry = totals.get(row.plan_id) ?? { total: 0, going: 0 };
    entry.total += 1;
    if (row.response === 'going') {
      entry.going += 1;
    }
    totals.set(row.plan_id, entry);
  }

  const creatorIds = [...new Set(plans.map((plan) => plan.creator_id))];
  const { data: creatorRows } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', creatorIds);

  const nameById = new Map<string, string>();
  for (const row of (creatorRows ?? []) as Array<{ id: string; display_name: string }>) {
    nameById.set(row.id, row.display_name);
  }

  return plans
    .map((plan) => {
      const tally = totals.get(plan.id) ?? { total: 0, going: 0 };
      return {
        id: plan.id,
        creatorId: plan.creator_id,
        creatorName: nameById.get(plan.creator_id) ?? null,
        title: plan.title,
        kind: plan.kind,
        startsAt: plan.starts_at,
        location: plan.location,
        expiresAt: plan.expires_at,
        responseCount: tally.total,
        goingCount: tally.going,
      };
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/**
 * Subscribe to anything that should reorder Pulse: new messages (Live now) and
 * new plans (Tap-in). Returns a no-op unsubscribe when the backend is missing.
 */
export function subscribeToPulse(handlers: { onChange: () => void }): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel('pulse')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      () => handlers.onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'plans' },
      () => handlers.onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'plan_responses' },
      () => handlers.onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}