/**
 * Pure status-wall shaping.
 *
 * Kept apart from statuses.ts so it can be unit tested: that module pulls in
 * expo-file-system and expo-image-manipulator, which need native modules and
 * would drag the whole test suite down with them.
 */

export type StatusKind = "text" | "photo" | "video" | "voice" | "location";

export interface StatusUpdate {
  id: string;
  authorId: string;
  kind: StatusKind;
  body: string;
  /** Storage path when the status carries media. */
  mediaPath: string | null;
  /** Short-lived URL for `mediaPath`; resolved lazily by the viewer. */
  mediaUrl: string | null;
  createdAt: string;
  expiresAt: string;
  replyCount: number;
  authorName: string;
  authorUsername: string;
  authorAvatar: string | null;
  authorPresence: string | null;
  /** True when the signed-in user posted this. */
  mine: boolean;
}

/**
 * Statuses are grouped per author, in the order their authors should appear.
 * The viewer walks this list left to right, like a status tray.
 */
export interface StatusGroup {
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string | null;
  authorPresence: string | null;
  updates: StatusUpdate[];
  /** False once every status in the group has been seen. */
  unseen: boolean;
}

/** Group statuses per author for the tray and the viewer. */
export function groupStatuses(
  updates: StatusUpdate[],
  viewerId: string | null,
  seenIds: ReadonlySet<string>,
): StatusGroup[] {
  const byAuthor = new Map<string, StatusUpdate[]>();

  for (const update of updates) {
    const list = byAuthor.get(update.authorId) ?? [];
    list.push({ ...update, mine: viewerId === update.authorId });
    byAuthor.set(update.authorId, list);
  }

  const groups: StatusGroup[] = [];
  for (const [authorId, list] of byAuthor) {
    const first = list[0];
    groups.push({
      authorId,
      authorName: first.authorName,
      authorUsername: first.authorUsername,
      authorAvatar: first.authorAvatar,
      authorPresence: first.authorPresence,
      updates: list,
      unseen: list.some((update) => !seenIds.has(update.id)),
    });
  }

  // Your own tray entry leads, then whoever is most recently active.
  groups.sort((a, b) => {
    if (a.authorId === viewerId) return -1;
    if (b.authorId === viewerId) return 1;
    const aTime = a.updates[a.updates.length - 1]?.createdAt ?? "";
    const bTime = b.updates[b.updates.length - 1]?.createdAt ?? "";
    return bTime.localeCompare(aTime);
  });

  return groups;
}
