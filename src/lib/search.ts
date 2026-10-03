import { getSupabase } from './supabase';
import { fetchConversationSummaries } from './conversations';

/**
 * Global search across people, spaces, conversations and messages.
 *
 * Scope follows the trust model: people and spaces are readable through RLS, so
 * they are plain selects. Messages are NOT — membership can only be resolved
 * from auth.uid() inside the database, so those go through the
 * `search_messages` RPC (migration 003), which filters every row through
 * is_conversation_member(). The client is never trusted to supply a conversation
 * id here.
 */

export const SEARCH_MIN_QUERY = 2;
export const SEARCH_RESULT_LIMIT = 25;

export interface SearchPerson {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  presence: string | null;
}

export interface SearchSpace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number;
  isPublic: boolean;
}

export interface SearchConversation {
  id: string;
  title: string;
  preview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface SearchMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  content: string;
  createdAt: string;
}

export interface SearchResults {
  people: SearchPerson[];
  spaces: SearchSpace[];
  conversations: SearchConversation[];
  messages: SearchMessage[];
}

export const EMPTY_RESULTS: SearchResults = {
  people: [],
  spaces: [],
  conversations: [],
  messages: [],
};

/** A query shorter than this is treated as "not searching yet". */
export function isSearchable(query: string): boolean {
  return query.trim().length >= SEARCH_MIN_QUERY;
}

/** Wildcard-free ilike pattern. Commas/brackets are literal here, not patterns. */
function containsPattern(query: string): string {
  // Escape the LIKE metacharacters so a user typing "100%" does not match everything.
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

export async function searchPeople(query: string): Promise<SearchPerson[]> {
  const supabase = getSupabase();
  if (!supabase || !isSearchable(query)) {
    return [];
  }

  const pattern = containsPattern(query.trim());
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, presence')
    .or(`display_name.ilike.${pattern},username.ilike.${pattern}`)
    .order('display_name', { ascending: true })
    .limit(SEARCH_RESULT_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;

  return ((data ?? []) as Array<{
    id: string;
    username: string | null;
    display_name: string;
    avatar_url: string | null;
    presence: string | null;
  }>)
    .filter((row) => row.id !== selfId)
    .map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      presence: row.presence,
    }));
}

export async function searchSpaces(query: string): Promise<SearchSpace[]> {
  const supabase = getSupabase();
  if (!supabase || !isSearchable(query)) {
    return [];
  }

  const pattern = containsPattern(query.trim());
  const { data, error } = await supabase
    .from('spaces')
    .select('id, name, slug, description, avatar_url, is_public, space_members(count)')
    .or(`name.ilike.${pattern},description.ilike.${pattern}`)
    .order('name', { ascending: true })
    .limit(SEARCH_RESULT_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    avatar_url: string | null;
    is_public: boolean;
    space_members: Array<{ count: number }> | null;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    avatarUrl: row.avatar_url,
    isPublic: row.is_public,
    // PostgREST returns embedded aggregates as an array of count rows.
    memberCount: row.space_members?.[0]?.count ?? 0,
  }));
}

function titleFromPeers(peerNames: string[]): string {
  if (peerNames.length === 0) return 'Conversation';
  if (peerNames.length === 1) return peerNames[0];
  return `${peerNames[0]} +${peerNames.length - 1}`;
}

/**
 * Conversations are filtered on the client because a direct conversation has no
 * `name` — its title is derived from its peers, which SQL cannot compute for an
 * arbitrary member set without a lateral join over every candidate.
 */
export async function searchConversations(query: string): Promise<SearchConversation[]> {
  if (!isSearchable(query)) {
    return [];
  }

  const summaries = await fetchConversationSummaries();
  const needle = query.trim().toLowerCase();

  return summaries
    .map((summary) => {
      const peerNames = summary.peers.map((peer) => peer.display_name);
      return {
        id: summary.id,
        title: summary.name ?? titleFromPeers(peerNames),
        preview: summary.last_message_preview,
        lastMessageAt: summary.last_message_at,
        unreadCount: summary.unread_count,
        haystack: [summary.name ?? '', summary.last_message_preview ?? '', ...peerNames]
          .join(' ')
          .toLowerCase(),
      };
    })
    .filter((row) => row.haystack.includes(needle))
    .sort((a, b) => Date.parse(b.lastMessageAt ?? '') - Date.parse(a.lastMessageAt ?? ''))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(({ haystack: _haystack, ...rest }) => rest);
}

/** Message bodies, scoped server-side to conversations the caller belongs to. */
export async function searchMessages(query: string): Promise<SearchMessage[]> {
  const supabase = getSupabase();
  if (!supabase || !isSearchable(query)) {
    return [];
  }

  const { data, error } = await supabase.rpc('search_messages', {
    query: query.trim(),
    result_limit: SEARCH_RESULT_LIMIT,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    message_id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    sender_name?: string | null;
  }>;

  // The RPC does not join profiles; resolve sender names in one extra query
  // rather than N. An empty id set means there is nothing to resolve.
  const senderIds = [...new Set(rows.map((row) => row.sender_id))];
  const nameById = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', senderIds);
    for (const row of (profileRows ?? []) as Array<{ id: string; display_name: string }>) {
      nameById.set(row.id, row.display_name);
    }
  }

  return rows.map((row) => ({
    messageId: row.message_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: nameById.get(row.sender_id) ?? row.sender_name ?? null,
    content: row.content,
    createdAt: row.created_at,
  }));
}

/**
 * Run every category and return whatever succeeded. A single failing category
 * must not blank the whole screen, so each is settled independently and the
 * failure is surfaced only if all of them failed.
 */
export async function searchEverything(query: string): Promise<SearchResults> {
  if (!isSearchable(query)) {
    return EMPTY_RESULTS;
  }

  const settled = await Promise.allSettled([
    searchPeople(query),
    searchSpaces(query),
    searchConversations(query),
    searchMessages(query),
  ]);

  const failed = settled.filter((result) => result.status === 'rejected');
  if (failed.length === settled.length) {
    throw failed[0] instanceof Error ? failed[0].reason : new Error('Search failed');
  }

  const [people, spaces, conversations, messages] = settled.map(
    (result) => (result.status === 'fulfilled' ? result.value : []),
  ) as [SearchPerson[], SearchSpace[], SearchConversation[], SearchMessage[]];

  return { people, spaces, conversations, messages };
}

export function totalResults(results: SearchResults): number {
  return (
    results.people.length +
    results.spaces.length +
    results.conversations.length +
    results.messages.length
  );
}