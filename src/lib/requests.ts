import { getSupabase } from "./supabase";
import { fetchConversationPreviews } from "./conversations";

/**
 * Message requests — first DMs from people who are not friends.
 *
 * A request is an ordinary direct conversation whose `status` is `requested`
 * until the recipient accepts it. The database enforces the budget (one text
 * message, no attachments) and hides read cursors; this module is the read
 * side the request screen needs.
 */

export interface MessageRequest {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerUsername: string | null;
  peerAvatar: string | null;
  /** The single message the sender is allowed before acceptance. */
  preview: string | null;
  createdAt: string;
}

export type RequestActionResult = { ok: boolean; error?: string };

export const REPORT_REASONS = [
  "Spam",
  "Harassment",
  "Impersonation",
  "Something else",
] as const;

/** Incoming requests only: ones this user did not send. */
export async function fetchMessageRequests(): Promise<MessageRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;
  if (!selfId) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, status, requested_by, created_at, conversation_members!inner (user_id, profile:profiles!conversation_members_user_id_fkey (id, display_name, username, avatar_url))",
    )
    .eq("status", "requested")
    .neq("requested_by", selfId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  type Row = {
    id: string;
    created_at: string;
    conversation_members?: Array<{
      user_id: string;
      profile: {
        id: string;
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
      } | null;
    }>;
  };

  const rows = (data ?? []) as unknown as Row[];
  const previews = await fetchConversationPreviews(rows.map((row) => row.id));

  return rows.map((row) => {
    const peer = row.conversation_members?.find(
      (member) => member.user_id !== selfId,
    );
    const profile = peer?.profile ?? null;
    return {
      conversationId: row.id,
      peerId: peer?.user_id ?? "",
      peerName: profile?.display_name?.trim() || profile?.username || "Someone",
      peerUsername: profile?.username ?? null,
      peerAvatar: profile?.avatar_url ?? null,
      preview: previews.get(row.id)?.content ?? null,
      createdAt: row.created_at,
    } as MessageRequest;
  });
}

/** Accept an incoming request. After this the conversation behaves normally. */
export async function acceptMessageRequest(
  conversationId: string,
): Promise<RequestActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Backend not configured" };

  const { error } = await supabase.rpc("accept_message_request", {
    p_conversation_id: conversationId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Decline/ignore an incoming request. The sender sees it as declined. */
export async function declineMessageRequest(
  conversationId: string,
): Promise<RequestActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Backend not configured" };

  const { error } = await supabase.rpc("decline_message_request", {
    p_conversation_id: conversationId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Report the sender of a request (or any profile) for moderation. */
export async function reportUser(
  userId: string,
  reason: string,
  conversationId?: string,
): Promise<RequestActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Backend not configured" };

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;
  if (!selfId) return { ok: false, error: "You need to be signed in." };
  if (selfId === userId) {
    return { ok: false, error: "You cannot report yourself." };
  }

  const { error } = await supabase.from("user_reports").insert({
    reporter_id: selfId,
    reported_user_id: userId,
    conversation_id: conversationId ?? null,
    reason,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Refetch when a request is created, accepted or declined elsewhere. */
export function subscribeToMessageRequests(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel("message-requests")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversations" },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
