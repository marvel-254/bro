import {
  hasMoreMemes,
  isSafeMemePath,
  memeUrl,
  mergeMemePage,
} from "../meme-queries";

describe("isSafeMemePath", () => {
  it("accepts ordinary library paths", () => {
    expect(isSafeMemePath("memes/222403160-bernie.jpg")).toBe(true);
    expect(isSafeMemePath("memes/a/b/c.png")).toBe(true);
  });

  it("rejects traversal", () => {
    expect(isSafeMemePath("memes/../../etc/passwd")).toBe(false);
    expect(isSafeMemePath("memes/..%2f..%2fetc")).toBe(false);
  });

  it("rejects absolute urls and paths", () => {
    expect(isSafeMemePath("https://evil.example/x.jpg")).toBe(false);
    expect(isSafeMemePath("http://evil.example/x.jpg")).toBe(false);
    expect(isSafeMemePath("/etc/passwd")).toBe(false);
  });

  it("rejects paths outside the memes prefix", () => {
    expect(isSafeMemePath("secrets/key.pem")).toBe(false);
    expect(isSafeMemePath("")).toBe(false);
  });

  it("rejects backslashes and absurd lengths", () => {
    expect(isSafeMemePath("memes\\x.jpg")).toBe(false);
    expect(isSafeMemePath(`memes/${"a".repeat(300)}.jpg`)).toBe(false);
  });
});

describe("memeUrl", () => {
  const base = "https://cdn.example.dev";

  it("joins base and key", () => {
    expect(memeUrl(base, "memes/a.jpg")).toBe(`${base}/memes/a.jpg`);
  });

  it("normalises trailing slashes and whitespace on the base", () => {
    expect(memeUrl(`${base}///`, "memes/a.jpg")).toBe(`${base}/memes/a.jpg`);
    expect(memeUrl(`  ${base}  `, "memes/a.jpg")).toBe(`${base}/memes/a.jpg`);
  });

  it("returns null rather than a half-built url", () => {
    expect(memeUrl("", "memes/a.jpg")).toBeNull();
    expect(memeUrl(base, "../secret")).toBeNull();
  });
});

describe("mergeMemePage", () => {
  const a = { id: "1" };
  const b = { id: "2" };
  const c = { id: "3" };

  it("appends new rows", () => {
    expect(mergeMemePage([a], [b, c])).toEqual([a, b, c]);
  });

  it("drops rows already present", () => {
    // Offset paging repeats a row when something is uploaded mid-scroll.
    expect(mergeMemePage([a, b], [b, c])).toEqual([a, b, c]);
  });

  it("returns an equal list when the page is entirely duplicate", () => {
    expect(mergeMemePage([a, b], [a, b])).toEqual([a, b]);
  });

  it("keeps order stable", () => {
    expect(mergeMemePage([a], [b, a, c])).toEqual([a, b, c]);
  });
});

describe("hasMoreMemes", () => {
  it("stops on a short page", () => {
    expect(hasMoreMemes(5, 12, 5)).toBe(false);
  });

  it("continues on a full page that added rows", () => {
    expect(hasMoreMemes(12, 12, 12)).toBe(true);
  });

  it("stops on a full page that was all duplicates", () => {
    // Otherwise the feed pages forever inside one region of repeats.
    expect(hasMoreMemes(12, 12, 0)).toBe(false);
  });
});
