import { groupStatuses, type StatusUpdate } from "../status-grouping";

function update(over: Partial<StatusUpdate>): StatusUpdate {
  return {
    id: "u1",
    authorId: "a1",
    kind: "text",
    body: "",
    mediaPath: null,
    mediaUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    replyCount: 0,
    authorName: "Ann",
    authorUsername: "ann",
    authorAvatar: null,
    authorPresence: "online",
    mine: false,
    ...over,
  };
}

describe("groupStatuses", () => {
  it("groups updates by author", () => {
    const groups = groupStatuses(
      [
        update({ id: "1", authorId: "a1" }),
        update({ id: "2", authorId: "a1" }),
        update({ id: "3", authorId: "a2" }),
      ],
      null,
      new Set(),
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].updates).toHaveLength(2);
    expect(groups[1].updates).toHaveLength(1);
  });

  it("marks a group unseen while any of its updates is unseen", () => {
    const groups = groupStatuses(
      [update({ id: "1" }), update({ id: "2" })],
      null,
      new Set(["1"]),
    );

    expect(groups[0].unseen).toBe(true);
  });

  it("marks a group seen only when every update has been seen", () => {
    const groups = groupStatuses(
      [update({ id: "1" }), update({ id: "2" })],
      null,
      new Set(["1", "2"]),
    );

    expect(groups[0].unseen).toBe(false);
  });

  it("puts the viewer's own group first", () => {
    const groups = groupStatuses(
      [
        update({
          id: "1",
          authorId: "other",
          createdAt: "2026-01-01T09:00:00.000Z",
        }),
        update({
          id: "2",
          authorId: "me",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      "me",
      new Set(),
    );

    expect(groups[0].authorId).toBe("me");
  });

  it("orders everyone else by most recent activity", () => {
    const groups = groupStatuses(
      [
        update({
          id: "1",
          authorId: "stale",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
        update({
          id: "2",
          authorId: "fresh",
          createdAt: "2026-01-01T09:00:00.000Z",
        }),
      ],
      null,
      new Set(),
    );

    expect(groups[0].authorId).toBe("fresh");
  });

  it("flags the viewer's own updates", () => {
    const groups = groupStatuses(
      [update({ id: "1", authorId: "me" })],
      "me",
      new Set(),
    );

    expect(groups[0].updates[0].mine).toBe(true);
  });

  it("returns nothing for no statuses", () => {
    expect(groupStatuses([], "me", new Set())).toEqual([]);
  });
});
