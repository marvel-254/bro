import {
  outboxPlaceholderText,
  ownMessageStatus,
  peerReadCursor,
} from "../message-display";
import type { OutboxEntry } from "../outbox";

describe("peerReadCursor", () => {
  it("returns null when nobody else has a cursor", () => {
    expect(peerReadCursor({}, "self")).toBeNull();
    expect(peerReadCursor({ self: "2026-10-03T12:00:00Z" }, "self")).toBeNull();
  });

  it("ignores the viewer's own cursor", () => {
    expect(
      peerReadCursor(
        {
          self: "2026-10-03T18:00:00Z",
          peer: "2026-10-03T12:00:00Z",
        },
        "self",
      ),
    ).toBe(Date.parse("2026-10-03T12:00:00Z"));
  });

  it("returns the newest cursor across several other members", () => {
    expect(
      peerReadCursor(
        {
          a: "2026-10-03T12:00:00Z",
          b: "2026-10-03T14:00:00Z",
          c: null,
        },
        "self",
      ),
    ).toBe(Date.parse("2026-10-03T14:00:00Z"));
  });

  it("skips unparseable timestamps instead of poisoning the result", () => {
    expect(
      peerReadCursor(
        { a: "not a date", b: "2026-10-03T12:00:00Z" },
        "self",
      ),
    ).toBe(Date.parse("2026-10-03T12:00:00Z"));
    expect(peerReadCursor({ a: "not a date" }, "self")).toBeNull();
  });
});

describe("ownMessageStatus", () => {
  const at = (iso: string) => Date.parse(iso);

  it("upgrades a sent message at or before the peer cursor to seen", () => {
    expect(
      ownMessageStatus("sent", "2026-10-03T12:00:00Z", at("2026-10-03T12:00:00Z")),
    ).toBe("seen");
    expect(
      ownMessageStatus("sent", "2026-10-03T11:00:00Z", at("2026-10-03T12:00:00Z")),
    ).toBe("seen");
  });

  it("leaves a sent message after the cursor alone", () => {
    expect(
      ownMessageStatus("sent", "2026-10-03T13:00:00Z", at("2026-10-03T12:00:00Z")),
    ).toBe("sent");
  });

  it("does not upgrade when there is no peer cursor", () => {
    expect(ownMessageStatus("sent", "2026-10-03T12:00:00Z", null)).toBe("sent");
  });

  it("never rewrites a non-sent status", () => {
    const cursor = at("2026-10-03T12:00:00Z");
    expect(ownMessageStatus("failed", "2026-10-03T11:00:00Z", cursor)).toBe(
      "failed",
    );
    expect(ownMessageStatus("sending", "2026-10-03T11:00:00Z", cursor)).toBe(
      "sending",
    );
    expect(ownMessageStatus("delivered", "2026-10-03T11:00:00Z", cursor)).toBe(
      "delivered",
    );
  });

  it("leaves an unparseable created_at untouched", () => {
    expect(ownMessageStatus("sent", "nope", at("2026-10-03T12:00:00Z"))).toBe(
      "sent",
    );
  });
});

describe("outboxPlaceholderText", () => {
  const entry = (over: Partial<OutboxEntry> = {}): OutboxEntry => ({
    clientId: "local-1",
    conversationId: "conv-1",
    content: "",
    replyToMessageId: null,
    createdAt: "2026-10-03T12:00:00Z",
    attempts: 0,
    kind: "text",
    ...over,
  });

  it("prefers a real caption", () => {
    expect(outboxPlaceholderText(entry({ kind: "image", content: "look" }))).toBe(
      "look",
    );
  });

  it("labels captionless media by kind", () => {
    expect(outboxPlaceholderText(entry({ kind: "image" }))).toBe("Photo");
    expect(outboxPlaceholderText(entry({ kind: "voice" }))).toBe(
      "Voice message",
    );
    expect(outboxPlaceholderText(entry({ kind: "gif" }))).toBe("GIF");
  });

  it("returns the empty content for an empty text entry", () => {
    expect(outboxPlaceholderText(entry({ kind: "text" }))).toBe("");
  });
});
