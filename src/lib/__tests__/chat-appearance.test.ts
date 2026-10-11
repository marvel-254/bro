import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BUBBLE_COLORS,
  DEFAULT_APPEARANCE,
  STORAGE_KEY_APPEARANCE,
  colorLuminance,
  loadAppearance,
  parseAppearance,
  readableTextOn,
  saveAppearance,
} from "../chat-appearance";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("parseAppearance", () => {
  it("falls back to defaults for null", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it("falls back to defaults for invalid JSON", () => {
    expect(parseAppearance("not json {")).toEqual(DEFAULT_APPEARANCE);
  });

  it("falls back to defaults for non-object JSON", () => {
    expect(parseAppearance('"a string"')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("42")).toEqual(DEFAULT_APPEARANCE);
  });

  it("accepts a valid appearance", () => {
    const raw = JSON.stringify({
      bubbleTheme: "teardrop",
      backgroundUri: "file:///tmp/bg.jpg",
      mineColor: "#0EA5E9",
      theirsColor: "#7C3AED",
    });
    expect(parseAppearance(raw)).toEqual({
      bubbleTheme: "teardrop",
      backgroundUri: "file:///tmp/bg.jpg",
      mineColor: "#0EA5E9",
      theirsColor: "#7C3AED",
    });
  });

  it("rejects an unknown bubble theme but keeps the background", () => {
    const raw = JSON.stringify({
      bubbleTheme: "fancy",
      backgroundUri: "file:///tmp/bg.jpg",
    });
    expect(parseAppearance(raw)).toEqual({
      bubbleTheme: DEFAULT_APPEARANCE.bubbleTheme,
      backgroundUri: "file:///tmp/bg.jpg",
      mineColor: null,
      theirsColor: null,
    });
  });

  it("treats an empty background uri as none", () => {
    const raw = JSON.stringify({ bubbleTheme: "rounded", backgroundUri: "" });
    expect(parseAppearance(raw)).toEqual({
      bubbleTheme: "rounded",
      backgroundUri: null,
      mineColor: null,
      theirsColor: null,
    });
  });

  it("rejects colours outside the palette", () => {
    const raw = JSON.stringify({
      bubbleTheme: "default",
      mineColor: "#123456",
      theirsColor: "javascript:alert(1)",
    });
    expect(parseAppearance(raw)).toEqual({
      ...DEFAULT_APPEARANCE,
      mineColor: null,
      theirsColor: null,
    });
  });

  it("accepts every palette colour", () => {
    for (const color of BUBBLE_COLORS) {
      const raw = JSON.stringify({
        bubbleTheme: "default",
        mineColor: color.value,
      });
      expect(parseAppearance(raw).mineColor).toBe(color.value);
    }
  });
});

describe("colour contrast helpers", () => {
  it("luminance is 0 for black and 1 for white", () => {
    expect(colorLuminance("#000000")).toBeCloseTo(0);
    expect(colorLuminance("#FFFFFF")).toBeCloseTo(1);
  });

  it("luminance is 0 for unparseable input", () => {
    expect(colorLuminance("not-a-color")).toBe(0);
    expect(colorLuminance("#fff")).toBe(0);
  });

  it("dark palette colours get light text", () => {
    expect(readableTextOn("#1F2937")).toBe("#F5F7FA");
    expect(readableTextOn("#475569")).toBe("#F5F7FA");
    expect(readableTextOn("#4F46E5")).toBe("#F5F7FA");
    expect(readableTextOn("#7C3AED")).toBe("#F5F7FA");
  });

  it("bright palette colours get dark text", () => {
    expect(readableTextOn("#F59E0B")).toBe("#101318");
    expect(readableTextOn("#84CC16")).toBe("#101318");
    expect(readableTextOn("#0EA5E9")).toBe("#101318");
    expect(readableTextOn("#EC4899")).toBe("#101318");
  });

  it("every palette colour yields a readable pairing", () => {
    for (const color of BUBBLE_COLORS) {
      if (!color.value) continue;
      const text = readableTextOn(color.value);
      const bgLum = colorLuminance(color.value);
      const textLum = colorLuminance(text);
      // WCAG contrast ratio must clear 4.5:1 for every swatch.
      const ratio =
        (Math.max(bgLum, textLum) + 0.05) /
        (Math.min(bgLum, textLum) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("load/save round trip", () => {
  it("saves under the shared key", async () => {
    await saveAppearance({
      bubbleTheme: "rounded",
      backgroundUri: "file:///tmp/bg.jpg",
      mineColor: "#0EA5E9",
      theirsColor: null,
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY_APPEARANCE,
      JSON.stringify({
        bubbleTheme: "rounded",
        backgroundUri: "file:///tmp/bg.jpg",
        mineColor: "#0EA5E9",
        theirsColor: null,
      }),
    );
  });

  it("loads what was stored", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        bubbleTheme: "teardrop",
        backgroundUri: null,
        mineColor: "#EF4444",
        theirsColor: null,
      }),
    );
    const result = await loadAppearance();
    expect(result).toEqual({
      bubbleTheme: "teardrop",
      backgroundUri: null,
      mineColor: "#EF4444",
      theirsColor: null,
    });
  });

  it("returns defaults when storage throws", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error("disk"));
    const result = await loadAppearance();
    expect(result).toEqual(DEFAULT_APPEARANCE);
  });
});
