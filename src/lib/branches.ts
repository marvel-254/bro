import { getSupabase } from "./supabase";
import type { MessageWithSender } from "./database.types";
import { MESSAGES_PAGE_SIZE } from "./conversations";

/**
 * Conversation branches — the signature BRO interaction.
 *
 * A branch is a room that sprouts off a message and keeps its context: you can
 * always see the message it started from, who is in it, and which conversation
 * it belongs to. That is the whole point, so this module never returns a branch
 * without its root.
 *
 * Schema notes that shape this file:
 *
 *   * `messages.branch_id` places a message inside a branch. A message is in
 *     exactly one place: the conversation, or a branch of it.
 *   * `conversation_branches.message_count` is maintained by the
 *     `messages_sync_branch` trigger (migration 005), never by the client. It is
 *     denormalised deliberately so the chat list can render the reply pill
 *     without counting rows per message.
 *   * Branch membership is one level deep. Posting into a branch never creates a
 *     sub-branch; see `postToBranch` for how that is enforced.
 *
 * RLS scopes every read and write to conversation membership, and the client is
 * never trusted for authorization: the creator is always the session user.
 */

export const BRANCH_TITLE_MAX = 80;

/** Direct replies needed before the UI suggests spinning off a branch. */
export const BRANCH_SUGGEST_AT = 5;

export interface Branch {
  id: string;
  conversationId: string;
  rootMessageId: string | null;
  title: string | null;
  createdBy: string;
  messageCount: number;
  isPinned: boolean;
  lastActivityAt: string;
  createdAt: string;
}

export interface BranchWithContext extends Branch {
  /** The message the branch started from. Null once that message is deleted. */
  rootMessage: MessageWithSender | null;
}

export type CreateBranchResult =
  | { ok: true; branch: Branch }
  | { ok: false; error: string };

export type SendToBranchResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/** A branch row exactly as PostgREST returns it, before mapping to `Branch`. */
interface RawBranch {
  id: string;
  conversation_id: string;
  root_message_id: string | null;
  title: string | null;
  created_by: string;
  message_count: number;
  is_pinned: boolean;
  last_activity_at: string;
  created_at: string;
}

const BRANCH_COLUMNS =
  "id, conversation_id, root_message_id, title, created_by, message_count, is_pinned, last_activity_at, created_at";

function toBranch(row: RawBranch): Branch {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    rootMessageId: row.root_message_id,
    title: row.title,
    createdBy: row.created_by,
    messageCount: row.message_count,
    isPinned: row.is_pinned,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
  };
}

/**
 * Reply counts per message, used to decide when to show the "N replies" pill.
 * One query for the whole page rather than one per message.
 */
export async function fetchReplyCounts(
  messageIds: string[],
): Promise<Record<string, number>> {
  const supabase = getSupabase();
  if (!supabase || messageIds.length === 0) {
    return {};
  }

  // Replies that already live inside a branch must not count toward the
  // parent's pill: branchFromReplies moves them, so counting them again would
  // resurrect the pill on a thread that already became a room.
  const { data, error } = await supabase
    .from("messages")
    .select("reply_to_message_id")
    .in("reply_to_message_id", messageIds)
    .is("branch_id", null)
    .eq("deleted_for_everyone", false);

  if (error) {
    // A missing pill must not break the chat screen.
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{
    reply_to_message_id: string | null;
  }>) {
    const parent = row.reply_to_message_id;
    if (!parent) continue;
    counts[parent] = (counts[parent] ?? 0) + 1;
  }
  return counts;
}

/**
 * Branch ids keyed by the message they hang off, for messages on this page that
 * already have a branch. Lets the chat screen link an existing branch instead of
 * offering to create a second one for the same message.
 */
export async function fetchBranchesByRoot(
  messageIds: string[],
): Promise<Record<string, string>> {
  const supabase = getSupabase();
  if (!supabase || messageIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("conversation_branches")
    .select("id, root_message_id")
    .in("root_message_id", messageIds);

  if (error) {
    return {};
  }

  const byRoot: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{
    id: string;
    root_message_id: string | null;
  }>) {
    if (row.root_message_id && !byRoot[row.root_message_id]) {
      byRoot[row.root_message_id] = row.id;
    }
  }
  return byRoot;
}

/** Branches in a conversation, most recently active first. */
export async function fetchBranches(
  conversationId: string,
): Promise<BranchWithContext[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("conversation_branches")
    .select(
      `${BRANCH_COLUMNS}, root: messages!conversation_branches_root_message_id_fkey (id, conversation_id, sender_id, content, type, status, reply_to_message_id, branch_id, created_at, updated_at, sender:profiles!messages_sender_id_fkey (id, username, display_name, avatar_url, status))`,
    )
    .eq("conversation_id", conversationId)
    .order("last_activity_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    (data ?? []) as unknown as Array<
      RawBranch & { root: MessageWithSender | null }
    >
  ).map((row) => ({
    ...toBranch(row),
    rootMessage: row.root ?? null,
  }));
}

/** One branch with its root message attached. Null when not found or not visible. */
export async function fetchBranch(
  branchId: string,
): Promise<BranchWithContext | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("conversation_branches")
    .select(
      `${BRANCH_COLUMNS}, root: messages!conversation_branches_root_message_id_fkey (id, conversation_id, sender_id, content, type, status, reply_to_message_id, branch_id, created_at, updated_at, sender:profiles!messages_sender_id_fkey (id, username, display_name, avatar_url, status))`,
    )
    .eq("id", branchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const row = data as unknown as RawBranch & { root: MessageWithSender | null };

  return {
    ...toBranch(row),
    rootMessage: row.root ?? null,
  };
}

/** Messages inside a branch, oldest-first so the thread reads top to bottom. */
export async function fetchBranchMessages(
  branchId: string,
  limit: number = MESSAGES_PAGE_SIZE,
): Promise<MessageWithSender[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, content, type, status, reply_to_message_id, branch_id, created_at, updated_at, deleted_for_everyone, sender:profiles!messages_sender_id_fkey (id, username, display_name, avatar_url, status)",
    )
    .eq("branch_id", branchId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as MessageWithSender[];
}

/**
 * Create a branch off a message.
 *
 * The title falls back to a trimmed slice of the root message so the branch is
 * never nameless in a list. The creator is the session user — RLS enforces the
 * same thing server-side, but there is no reason to send an id we could forge.
 */
export async function createBranch(
  conversationId: string,
  rootMessageId: string,
  title?: string | null,
): Promise<CreateBranchResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  const trimmed = title?.trim() ?? "";
  if (trimmed.length > BRANCH_TITLE_MAX) {
    return {
      ok: false,
      error: `Keep the title under ${BRANCH_TITLE_MAX} characters`,
    };
  }

  const { data, error } = await supabase
    .from("conversation_branches")
    .insert({
      conversation_id: conversationId,
      root_message_id: rootMessageId,
      title: trimmed || null,
      created_by: selfId,
    })
    .select(BRANCH_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, branch: toBranch(data as RawBranch) };
}

/**
 * Post into a branch.
 *
 * Deliberately does NOT set reply_to_message_id: a message in a branch replies
 * to the branch, not to a sibling message, and setting it would double-count in
 * the parent's reply pill. Branch depth stays one level for the same reason.
 */
export async function postToBranch(
  branchId: string,
  content: string,
): Promise<SendToBranchResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: "Message cannot be empty" };
  }

  const { data: userData } = await supabase.auth.getUser();
  const senderId = userData.user?.id;
  if (!senderId) {
    return { ok: false, error: "Not signed in" };
  }

  // messages.conversation_id is NOT NULL, so it has to come from the branch
  // rather than be invented. This read is also what RLS scopes: if you are not a
  // member of the branch's conversation this returns null and we stop here.
  const { data: branch, error: branchError } = await supabase
    .from("conversation_branches")
    .select("conversation_id")
    .eq("id", branchId)
    .maybeSingle();

  if (branchError) {
    return { ok: false, error: branchError.message };
  }
  if (!branch) {
    return { ok: false, error: "Branch not found" };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: (branch as { conversation_id: string }).conversation_id,
      branch_id: branchId,
      sender_id: senderId,
      content: trimmed,
      type: "text",
      status: "sent",
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, messageId: (data as { id: string }).id };
}

/** Rename a branch. Any conversation member may do this under the current RLS. */
export async function renameBranch(
  branchId: string,
  title: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const trimmed = title.trim();
  if (trimmed.length > BRANCH_TITLE_MAX) {
    return {
      ok: false,
      error: `Keep the title under ${BRANCH_TITLE_MAX} characters`,
    };
  }

  const { error } = await supabase
    .from("conversation_branches")
    .update({ title: trimmed || null })
    .eq("id", branchId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Delete a branch. Its messages are released back into the parent conversation
 * (branch_id -> null) rather than destroyed, so nothing is lost.
 */
export async function deleteBranch(
  branchId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const { error } = await supabase
    .from("conversation_branches")
    .delete()
    .eq("id", branchId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Seed a branch from an existing reply thread: take the replies to a message and
 * move them into a new branch. This is how a busy thread becomes a room without
 * anyone retyping anything.
 */
export async function branchFromReplies(
  conversationId: string,
  rootMessageId: string,
): Promise<CreateBranchResult> {
  const created = await createBranch(conversationId, rootMessageId);
  if (!created.ok) {
    return created;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return created;
  }

  const { error } = await supabase
    .from("messages")
    .update({ branch_id: created.branch.id })
    .eq("reply_to_message_id", rootMessageId)
    .eq("conversation_id", conversationId)
    .is("branch_id", null);

  if (error) {
    // Roll the branch back so we never leave an empty shell behind.
    await deleteBranch(created.branch.id);
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    branch: { ...created.branch, messageCount: 0 },
  };
}

/** Live updates inside one branch. */
export function subscribeToBranch(
  branchId: string,
  handlers: { onChange: () => void },
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel(`branch:${branchId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `branch_id=eq.${branchId}`,
      },
      () => handlers.onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "conversation_branches",
        filter: `id=eq.${branchId}`,
      },
      () => handlers.onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Live updates to branch creation and counters, for the chat screen's pills. */
export function subscribeToBranches(
  conversationId: string,
  handlers: { onChange: () => void },
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel(`branches:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "conversation_branches",
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => handlers.onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
