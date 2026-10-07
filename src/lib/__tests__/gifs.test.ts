import { isSafeGifPath, normaliseGifQuery } from "../gif-queries";

describe("isSafeGifPath", () => {
  it("accepts an ordinary library path", () => {
    expect(isSafeGifPath("cats/celebrate.gif")).toBe(true);
    expect(isSafeGifPath("party-01.gif")).toBe(true);
  });

  it("rejects traversal", () => {
    expect(isSafeGifPath("../secrets.txt")).toBe(false);
    expect(isSafeGifPath("cats/../../etc/passwd")).toBe(false);
  });

  it("rejects absolute urls", () => {
    expect(isSafeGifPath("https://evil.example/x.gif")).toBe(false);
    expect(isSafeGifPath("/etc/passwd")).toBe(false);
  });

  it("rejects empty and backslash paths", () => {
    expect(isSafeGifPath("")).toBe(false);
    expect(isSafeGifPath("cats\\x.gif")).toBe(false);
  });

  it("rejects an absurdly long path", () => {
    expect(isSafeGifPath("a".repeat(201))).toBe(false);
  });
});

describe("normaliseGifQuery", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normaliseGifQuery("  Cat   DANCE ")).toBe("cat dance");
  });

  it("strips punctuation that could be injected", () => {
    expect(normaliseGifQuery("cat'; drop table --")).toBe("cat drop table");
    expect(normaliseGifQuery("<script>")).toBe("script");
  });

  it("caps the length", () => {
    expect(normaliseGifQuery("a".repeat(80))).toHaveLength(40);
  });

  it("returns empty for punctuation only", () => {
    expect(normaliseGifQuery("!!!")).toBe("");
  });
});
