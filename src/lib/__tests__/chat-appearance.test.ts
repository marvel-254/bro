import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_APPEARANCE,
  STORAGE_KEY_APPEARANCE,
  loadAppearance,
  parseAppearance,
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
    });
    expect(parseAppearance(raw)).toEqual({
      bubbleTheme: "teardrop",
      backgroundUri: "file:///tmp/bg.jpg",
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
    });
  });

  it("treats an empty background uri as none", () => {
    const raw = JSON.stringify({ bubbleTheme: "rounded", backgroundUri: "" });
    expect(parseAppearance(raw)).toEqual({
      bubbleTheme: "rounded",
      backgroundUri: null,
    });
  });
});

describe("load/save round trip", () => {
  it("saves under the shared key", async () => {
    await saveAppearance({
      bubbleTheme: "rounded",
      backgroundUri: "file:///tmp/bg.jpg",
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY_APPEARANCE,
      JSON.stringify({
        bubbleTheme: "rounded",
        backgroundUri: "file:///tmp/bg.jpg",
      }),
    );
  });

  it("loads what was stored", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ bubbleTheme: "teardrop", backgroundUri: null }),
    );
    const result = await loadAppearance();
    expect(result).toEqual({ bubbleTheme: "teardrop", backgroundUri: null });
  });

  it("returns defaults when storage throws", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error("disk"));
    const result = await loadAppearance();
    expect(result).toEqual(DEFAULT_APPEARANCE);
  });
});
