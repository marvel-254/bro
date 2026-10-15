import {
  formatVoiceDuration,
  playbackFraction,
} from "../../../lib/voice-utils";

describe("formatVoiceDuration", () => {
  it("formats zero as 0:00", () => {
    expect(formatVoiceDuration(0)).toBe("0:00");
  });

  it("pads single-digit seconds", () => {
    expect(formatVoiceDuration(5)).toBe("0:05");
    expect(formatVoiceDuration(59)).toBe("0:59");
  });

  it("rolls minutes past the hour mark", () => {
    expect(formatVoiceDuration(60)).toBe("1:00");
    expect(formatVoiceDuration(125)).toBe("2:05");
  });

  it("floors fractional seconds and clamps negatives", () => {
    expect(formatVoiceDuration(7.9)).toBe("0:07");
    expect(formatVoiceDuration(-3)).toBe("0:00");
  });
});

describe("playbackFraction", () => {
  it("returns 0 when the duration is unknown or zero", () => {
    expect(playbackFraction(500, undefined)).toBe(0);
    expect(playbackFraction(500, 0)).toBe(0);
  });

  it("returns the played share for a known duration", () => {
    expect(playbackFraction(500, 1000)).toBe(0.5);
    expect(playbackFraction(0, 4000)).toBe(0);
  });

  it("clamps positions outside the clip", () => {
    expect(playbackFraction(-100, 1000)).toBe(0);
    expect(playbackFraction(2000, 1000)).toBe(1);
  });
});
