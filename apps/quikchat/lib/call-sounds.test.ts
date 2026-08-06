// The calling-audio controller. Two things matter here beyond "does it beep":
//  1. Looping sounds must stop COMPLETELY — timer cleared and the in-flight
//     oscillators silenced — or audio outlives the call.
//  2. Nothing may throw: these run on the call path, where an exception would
//     take down ringing or hang-up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetCallSoundsForTest,
  callSoundsSupported,
  playConnectedTone,
  playEndedTone,
  startRingback,
  startRingtone,
} from "./call-sounds";

interface FakeOsc {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function fakeContext(over: { state?: string; resume?: () => Promise<void> } = {}) {
  const oscillators: FakeOsc[] = [];
  const ctx = {
    state: over.state ?? "running",
    currentTime: 0,
    resume: over.resume ?? vi.fn(async () => {}),
    destination: {} as unknown,
    close: vi.fn(async () => {}),
    createOscillator: vi.fn((): FakeOsc => {
      const osc: FakeOsc = {
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
  };
  return { ctx, oscillators };
}

/** jsdom has no AudioContext, so each test installs its own. */
function install(ctx: unknown) {
  const factory = vi.fn(() => ctx);
  vi.stubGlobal("AudioContext", factory);
  return factory;
}

beforeEach(() => {
  __resetCallSoundsForTest();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetCallSoundsForTest();
});

describe("guards", () => {
  it("callSoundsSupported is false without an AudioContext (jsdom, SSR)", () => {
    expect(callSoundsSupported()).toBe(false);
  });

  it("every entry point no-ops without WebAudio, and stop stays callable", () => {
    const stopRing = startRingtone();
    const stopBack = startRingback();
    expect(() => stopRing()).not.toThrow();
    expect(() => stopBack()).not.toThrow();
    expect(() => playConnectedTone()).not.toThrow();
    expect(() => playEndedTone()).not.toThrow();
  });

  it("swallows a throwing AudioContext constructor", () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => {
        throw new Error("blocked");
      }),
    );
    expect(() => startRingtone()()).not.toThrow();
    expect(() => playConnectedTone()).not.toThrow();
  });

  it("swallows a throwing audio API mid-pattern", () => {
    const { ctx } = fakeContext();
    ctx.createOscillator = vi.fn(() => {
      throw new Error("audio hardware gone");
    }) as never;
    install(ctx);
    let stop: () => void = () => {};
    expect(() => {
      stop = startRingtone();
    }).not.toThrow();
    expect(() => stop()).not.toThrow();
  });

  it("resumes a context suspended by the autoplay policy", () => {
    const { ctx } = fakeContext({ state: "suspended" });
    install(ctx);
    startRingtone()();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("swallows a rejected resume()", async () => {
    const { ctx } = fakeContext({
      state: "suspended",
      resume: () => Promise.reject(new Error("NotAllowedError")),
    });
    install(ctx);
    expect(() => startRingback()()).not.toThrow();
    await Promise.resolve();
  });
});

describe("one-shot tones", () => {
  it("connected and ended are distinct two-note patterns", () => {
    const { ctx, oscillators } = fakeContext();
    install(ctx);

    playConnectedTone();
    const connected = oscillators.map((o) => o.frequency.value);
    oscillators.length = 0;
    playEndedTone();
    const ended = oscillators.map((o) => o.frequency.value);

    expect(connected).toHaveLength(2);
    expect(ended).toHaveLength(2);
    expect(connected).not.toEqual(ended);
    // Connected rises, ended falls — audibly different outcomes.
    expect(connected[1]!).toBeGreaterThan(connected[0]!);
    expect(ended[1]!).toBeLessThan(ended[0]!);
  });

  it("schedules nothing further (no loop timer)", () => {
    vi.useFakeTimers();
    const { ctx, oscillators } = fakeContext();
    install(ctx);
    playConnectedTone();
    const afterFirst = oscillators.length;
    vi.advanceTimersByTime(30_000);
    expect(oscillators).toHaveLength(afterFirst);
  });
});

describe("looping sounds", () => {
  it("ringtone and ringback are distinct patterns", () => {
    const { ctx, oscillators } = fakeContext();
    install(ctx);

    const stopRing = startRingtone();
    const ringtone = oscillators.map((o) => o.frequency.value);
    stopRing();
    oscillators.length = 0;
    const stopBack = startRingback();
    const ringback = oscillators.map((o) => o.frequency.value);
    stopBack();

    expect(ringtone.length).toBeGreaterThan(1); // warble
    expect(ringback).toHaveLength(1); // single tone
    expect(ringtone).not.toEqual(ringback);
  });

  it("repeats until stopped, then schedules nothing more", () => {
    vi.useFakeTimers();
    const { ctx, oscillators } = fakeContext();
    install(ctx);

    const stop = startRingtone();
    const firstPass = oscillators.length;
    expect(firstPass).toBeGreaterThan(0);

    vi.advanceTimersByTime(3_000);
    expect(oscillators.length).toBeGreaterThan(firstPass); // looped

    const atStop = oscillators.length;
    stop();
    vi.advanceTimersByTime(30_000);
    expect(oscillators).toHaveLength(atStop); // no further passes — timer cleared
  });

  it("stop silences the pass already in flight, not just future ones", () => {
    const { ctx, oscillators } = fakeContext();
    install(ctx);

    const stop = startRingtone();
    expect(oscillators.length).toBeGreaterThan(0);
    // Scheduled oscillators have an end time, but a mid-pattern stop must cut
    // them short — otherwise the ring keeps sounding after the call is answered.
    expect(oscillators.every((o) => o.stop.mock.calls.length === 1)).toBe(true); // scheduled end

    stop();

    expect(oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true); // + early stop
    expect(oscillators.every((o) => o.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it("stop is idempotent", () => {
    vi.useFakeTimers();
    const { ctx, oscillators } = fakeContext();
    install(ctx);

    const stop = startRingtone();
    stop();
    const atStop = oscillators.length;
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect(oscillators).toHaveLength(atStop);
  });

  it("tolerates an oscillator that throws on early stop", () => {
    const { ctx, oscillators } = fakeContext();
    install(ctx);
    const stop = startRingtone();
    for (const osc of oscillators) {
      osc.stop.mockImplementation(() => {
        throw new Error("InvalidStateError");
      });
    }
    expect(() => stop()).not.toThrow();
  });

  it("two loops at once stop independently", () => {
    vi.useFakeTimers();
    const { ctx, oscillators } = fakeContext();
    install(ctx);

    const stopRing = startRingtone();
    const stopBack = startRingback();
    oscillators.length = 0;

    stopRing();
    vi.advanceTimersByTime(8_000);
    // Ringback is still looping on its own timer.
    expect(oscillators.length).toBeGreaterThan(0);

    const atStop = oscillators.length;
    stopBack();
    vi.advanceTimersByTime(30_000);
    expect(oscillators).toHaveLength(atStop);
  });

  it("reuses one AudioContext across sounds (no handle leak)", () => {
    const factory = install(fakeContext().ctx);
    startRingtone()();
    startRingback()();
    playConnectedTone();
    playEndedTone();
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
