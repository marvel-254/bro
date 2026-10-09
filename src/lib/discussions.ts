/**
 * Discussions — an idea someone puts up, anyone builds on.
 *
 * Replaces plans (src/lib/plans.ts), which could only record attendance:
 * one row per person saying going/maybe/cant, with nowhere to actually say
 * what you thought. There is no RSVP here and no schedule.
 *
 * Visibility is wide on purpose. Any signed-in user can read every discussion
 * and contribute to any of them, including discussions by people they neither
 * follow nor are followed by. A discussion is where an idea meets the whole
 * app; gating it to a follower graph would make it a private note.
 */

import { getSupabase } from "./supabase";

/** Matches the CHECK constraints on `discussions`. */
export const DISCUSSION_TITLE_MAX = 140;
export const DISCUSSION_BODY_MAX = 4000;
/** Matches the CHECK on `discussion_contributions`. */
export const CONTRIBUTION_MAX = 2000;

export interface DiscussionAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Discussion {
  id: string;
  creatorId: string;
  title: string;
  body: string;
  isClosed: boolean;
  createdAt: string;
  /** How many people have contributed. Not a headcount of attendees. */
  contributionCount: number;
  /** The signed-in user's own contribution body, if they have one. */
  myContribution: string | null;
  author: DiscussionAuthor;
}

export interface Contribution {
  id: string;
  discussionId: string;
  authorId: string;
  body: string;
  createdAt: string;
  mine: boolean;
  author: DiscussionAuthor;
}

export type CreateDiscussionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function backendMissing(): { ok: false; error: string } {
  return { ok: false, error: "Backend not configured" };
}

/**
 * Start a discussion.
 *
 * Title is required, body is not: some threads are better opened with a
 * single line, and forcing a paragraph before you can post is a wall.
 */
export async function createDiscussion(input: {
  title: string;
  body?: string;
}): Promise<CreateDiscussionResult> {
  const supabase = getSupabase();
  if (!supabase) return backendMissing();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "You need to be signed in." };
  }

  const title = input.title.trim();
  const body = (input.body ?? "").trim();

  if (title.length === 0) return { ok: false, error: "Give it a title." };
  if (title.length > DISCUSSION_TITLE_MAX) {
    return {
      ok: false,
      error: `Keep the title under ${DISCUSSION_TITLE_MAX} characters.`,
    };
  }
  if (body.length > DISCUSSION_BODY_MAX) {
    return {
      ok: false,
      error: `Keep the opening post under ${DISCUSSION_BODY_MAX} characters.`,
    };
  }

  const { data, error } = await supabase
    .from("discussions")
    .insert({ creator_id: userData.user.id, title, body })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not post that." };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Add or replace your contribution.
 *
 * One row per person per discussion (a unique constraint in the database), so
 * this is an upsert rather than an insert — otherwise a second reply would
 * fail with a duplicate key error instead of editing what you already said.
 */
export async function contribute(
  discussionId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return backendMissing();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "You need to be signed in." };
  }

  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Say something first." };
  }
  if (trimmed.length > CONTRIBUTION_MAX) {
    return {
      ok: false,
      error: `Keep it under ${CONTRIBUTION_MAX} characters.`,
    };
  }

  const { error } = await supabase.from("discussion_contributions").upsert(
    {
      discussion_id: discussionId,
      author_id: userData.user.id,
      body: trimmed,
    },
    { onConflict: "discussion_id,author_id" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Withdraw your contribution, leaving the thread as you found it. */
export async function withdrawContribution(
  discussionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return backendMissing();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "You need to be signed in." };
  }

  const { error } = await supabase
    .from("discussion_contributions")
    .delete()
    .eq("discussion_id", discussionId)
    .eq("author_id", userData.user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Stop taking new contributions. The creator's own contribution stays. */
export async function closeDiscussion(
  discussionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return backendMissing();

  const { error } = await supabase
    .from("discussions")
    .update({ is_closed: true, updated_at: new Date().toISOString() })
    .eq("id", discussionId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

type DiscussionRow = {
  id: string;
  creator_id: string;
  title: string;
  body: string;
  is_closed: boolean;
  created_at: string;
  creator: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

type ContributionRow = {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

function toAuthor(row: {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}): DiscussionAuthor {
  return {
    id: row.id,
    name: row.display_name || row.username || "Someone",
    avatarUrl: row.avatar_url,
  };
}

const AUTHOR_FIELDS =
  "author:profiles!discussions_creator_id_fkey(id, display_name, username, avatar_url)";

/**
 * The discussion feed, newest first.
 *
 * Throws on a failed query so the caller can show a real error rather than an
 * empty list — an empty feed here is a legitimate state with its own copy, and
 * conflating the two is how "the network is down" becomes "nobody has posted".
 */
export async function fetchDiscussions(
  limit = 20,
): Promise<Discussion[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: userData } = await supabase.auth.getUser();
  const me = userData?.user?.id ?? null;

  const { data, error } = await supabase
    .from("discussions")
    .select(
      `id, creator_id, title, body, is_closed, created_at, ${AUTHOR_FIELDS}`,
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error || !data) throw new Error(error?.message ?? "Could not load discussions");
  const rows = data as unknown as DiscussionRow[];
  if (rows.length === 0) return [];

  // Counts and your own contribution in two queries rather than one per row.
  const ids = rows.map((row) => row.id);
  const [countsResult, mineResult] = await Promise.all([
    supabase
      .from("discussion_contributions")
      .select("discussion_id", { count: "exact" })
      .in("discussion_id", ids),
    me
      ? supabase
          .from("discussion_contributions")
          .select("discussion_id, body")
          .in("discussion_id", ids)
          .eq("author_id", me)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const counts = new Map<string, number>();
  for (const row of (countsResult.data ?? []) as unknown as {
    discussion_id: string;
  }[]) {
    counts.set(row.discussion_id, (counts.get(row.discussion_id) ?? 0) + 1);
  }
  // `count: "exact"` returns one aggregate row per group; use it when present.
  if (typeof countsResult.count === "number" && rows.length === 1) {
    counts.set(rows[0].id, countsResult.count);
  }

  const mine = new Map<string, string>();
  for (const row of (mineResult.data ?? []) as unknown as {
    discussion_id: string;
    body: string;
  }[]) {
    mine.set(row.discussion_id, row.body);
  }

  return rows.map((row) => ({
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    body: row.body,
    isClosed: row.is_closed,
    createdAt: row.created_at,
    contributionCount: counts.get(row.id) ?? 0,
    myContribution: mine.get(row.id) ?? null,
    author: toAuthor(
      row.creator ?? {
        id: row.creator_id,
        display_name: null,
        username: null,
        avatar_url: null,
      },
    ),
  }));
}

/** Every contribution on one thread, oldest first — the order it happened. */
export async function fetchContributions(
  discussionId: string,
): Promise<Contribution[]> {
  const supabase = getSupabase();
  if (!supabase || !discussionId) return [];

  const { data, error } = await supabase
    .from("discussion_contributions")
    .select(
      "id, discussion_id, author_id, body, created_at, author:profiles!discussion_contributions_author_id_fkey(id, display_name, username, avatar_url)",
    )
    .eq("discussion_id", discussionId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);

  if (error || !data) return [];
  const me = (await supabase.auth.getUser()).data?.user?.id ?? null;

  return (data as unknown as ContributionRow[]).map((row) => ({
    id: row.id,
    discussionId: row.discussion_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    mine: row.author_id === me,
    author: toAuthor(
      row.author ?? {
        id: row.author_id,
        display_name: null,
        username: null,
        avatar_url: null,
      },
    ),
  }));
}
