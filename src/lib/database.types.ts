/**
 * Row types mirroring supabase/migrations/20261003000100_bro_initial_schema.sql.
 * Kept hand-written (rather than generated) so the app compiles without the
 * Supabase CLI. Regenerate with `supabase gen types typescript` if the schema
 * changes and keep this file in sync.
 */

export interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  interests: string[];
  status: "online" | "offline" | "away";
  last_seen_at: string | null;
  created_at: string;
}

export interface SpaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: string;
  is_public: boolean;
  created_at: string;
}

export interface SpaceMemberRow {
  space_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
}

export interface ConversationRow {
  id: string;
  type: "direct" | "group" | "space" | "live";
  name: string | null;
  avatar_url: string | null;
  space_id: string | null;
  created_by: string;
  is_pinned: boolean;
  created_at: string;
}

export interface ConversationMemberRow {
  conversation_id: string;
  user_id: string;
  role: "admin" | "member";
  is_muted: boolean;
  joined_at: string;
  last_read_at: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  type: "text" | "image" | "file" | "voice";
  status: "pending" | "sending" | "sent" | "delivered" | "seen" | "failed";
  reply_to_message_id: string | null;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationBranchRow {
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

export interface MessageReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

/** A message joined with the sender's public profile, as returned by the app. */
export interface MessageWithSender extends MessageRow {
  sender: Pick<
    ProfileRow,
    "id" | "username" | "display_name" | "avatar_url" | "status"
  > | null;
  expires_at?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  deleted_for_everyone?: boolean;
}

export interface ConversationSummary {
  id: string;
  type: ConversationRow["type"];
  name: string | null;
  avatar_url: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: string | null;
  unread_count: number;
  /** Peers (everyone except the caller) with presence, for the list avatar. */
  peers: Array<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    presence: string | null;
    presence_text: string | null;
    presence_emoji: string | null;
  }>;
}
