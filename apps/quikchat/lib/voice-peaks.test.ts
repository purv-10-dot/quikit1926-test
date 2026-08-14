import { describe, expect, it } from "vitest";
import {
  fractionToTime,
  hashSeed,
  PEAK_MIN,
  pseudoPeaks,
  timeToFraction,
  VOICE_WAVE_BARS,
} from "./voice-peaks";

describe("pseudoPeaks", () => {
  it("is deterministic — the same seed always yields an identical array", () => {
    // This is the whole contract: a note must render the same bars across
    // reloads, across users, and after being forwarded.
    const a = pseudoPeaks("quikchat/org/chan/uuid-voice.webm");
    const b = pseudoPeaks("quikchat/org/chan/uuid-voice.webm");
    expect(a).toEqual(b);
  });

  it("differs between seeds", () => {
    const a = pseudoPeaks("seed-one");
    const b = pseudoPeaks("seed-two");
    expect(a).not.toEqual(b);
  });

  it("renders exactly VOICE_WAVE_BARS bars by default", () => {
    expect(VOICE_WAVE_BARS).toBe(40);
    expect(pseudoPeaks("x")).toHaveLength(40);
    expect(pseudoPeaks("x", 12)).toHaveLength(12);
  });

  it("stays within the normalized 0.15–1.0 range for many seeds", () => {
    for (let i = 0; i < 200; i++) {
      for (const v of pseudoPeaks(`seed-${i}`)) {
        expect(v).toBeGreaterThanOrEqual(PEAK_MIN);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("normalizes so the loudest bar reaches exactly 1", () => {
    const peaks = pseudoPeaks("normalize-me");
    expect(Math.max(...peaks)).toBeCloseTo(1, 10);
  });

  it("varies within a single note (not a flat bar)", () => {
    const peaks = pseudoPeaks("variation");
    expect(new Set(peaks.map((p) => p.toFixed(4))).size).toBeGreaterThan(10);
  });

  it("handles an empty seed and a single-bar request without NaN", () => {
    expect(pseudoPeaks("").every(Number.isFinite)).toBe(true);
    expect(pseudoPeaks("x", 1)).toEqual([1]);
  });
});

/**
 * Regression guard for the white-noise bug: the original implementation drew two
 * INDEPENDENT randoms per bar with no term depending on `i`, so adjacent bars were
 * statistically independent.
 *
 * The metric is lag-1 autocorrelation, NOT mean adjacent |Δ|. The latter was
 * measured and disqualified: over 500 seeds white noise bottoms out at 0.1438
 * while the envelope-without-smoothing tops out at 0.1355 — a 6% gap, so a lucky
 * seed could pass a guard meant to catch it. Autocorrelation separates the two
 * designs structurally, because the envelope is the dominant (0.75-weighted) term:
 *
 *   envelope + 3-tap (shipped)  mean 0.8984   min 0.6863   (2000 seeds)
 *   envelope, no smoothing      mean 0.7270   min 0.0156
 *   white noise (the bug)       mean -0.0238  max 0.4688
 *
 * At the 0.6 threshold the SHIPPED design separates universally (0.6863 > 0.4688),
 * so pinned seeds are here for determinism and flake-resistance, not to paper over
 * an overlap. ⚠️ That changes if the 3-tap smoothing pass is ever dropped: the
 * unsmoothed series reaches 0.0156, which overlaps white noise's 0.4688, and this
 * guard would then be sound ONLY for these pinned seeds. Do not switch to
 * generated seeds without re-measuring.
 */
const CORRELATION_SEEDS = [
  "quikchat/o1/c1/aaaa-voice-message-1.webm",
  "quikchat/o1/c1/bbbb-voice-message-2.webm",
  "quikchat/o2/c9/cccc-voice-message-3.m4a",
  "seed-0",
  "seed-1",
  "seed-42",
  "",
  "x",
];

describe("pseudoPeaks correlation", () => {
  it.each(CORRELATION_SEEDS)("correlates adjacent bars for seed %j", (seed) => {
    const peaks = pseudoPeaks(seed);
    const mean = peaks.reduce((a, b) => a + b, 0) / peaks.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < peaks.length - 1; i++) {
      num += (peaks[i]! - mean) * (peaks[i + 1]! - mean);
    }
    for (const v of peaks) den += (v - mean) ** 2;
    const autocorrelation = den > 0 ? num / den : 0;
    expect(autocorrelation).toBeGreaterThan(0.6);
  });
});

describe("hashSeed", () => {
  it("is stable and returns an unsigned 32-bit int", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
    const h = hashSeed("some/object/path.webm");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("fractionToTime / timeToFraction", () => {
  it("maps a fraction onto the duration", () => {
    expect(fractionToTime(0, 8)).toBe(0);
    expect(fractionToTime(0.5, 8)).toBe(4);
    expect(fractionToTime(1, 8)).toBe(8);
  });

  it("maps a time back onto a fraction", () => {
    expect(timeToFraction(0, 8)).toBe(0);
    expect(timeToFraction(4, 8)).toBe(0.5);
    expect(timeToFraction(8, 8)).toBe(1);
  });

  it("round-trips", () => {
    expect(timeToFraction(fractionToTime(0.37, 12), 12)).toBeCloseTo(0.37, 10);
  });

  it("clamps out-of-range inputs", () => {
    expect(fractionToTime(-1, 8)).toBe(0);
    expect(fractionToTime(2, 8)).toBe(8);
    expect(timeToFraction(-5, 8)).toBe(0);
    expect(timeToFraction(99, 8)).toBe(1);
  });

  it("returns 0 for an unusable duration — the Infinity webm case", () => {
    // MediaRecorder webm reports no container duration, so audio.duration is
    // commonly Infinity/NaN. Both mappings must stay safe rather than produce NaN.
    for (const bad of [undefined, 0, -3, Infinity, NaN]) {
      expect(fractionToTime(0.5, bad as number | undefined)).toBe(0);
      expect(timeToFraction(2, bad as number | undefined)).toBe(0);
    }
  });

  it("never returns NaN for a NaN fraction/time", () => {
    expect(fractionToTime(NaN, 8)).toBe(0);
    expect(timeToFraction(NaN, 8)).toBe(0);
  });
});
