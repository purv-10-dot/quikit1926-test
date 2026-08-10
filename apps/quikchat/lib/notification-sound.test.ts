// The chime helper sits on the notification delivery path, so its contract is
// as much "never throws" as "makes noise": every unsupported / blocked / broken
// audio path must degrade to silence, not to an exception.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetNotificationSoundForTest,
  notificationSoundSupported,
  playNotificationSound,
} from "./notification-sound";

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
}

function fakeContext(over: { state?: string; resume?: () => Promise<void> } = {}) {
  const started: number[] = [];
  const stopped: number[] = [];
  const oscillators: Array<{ frequency: { value: number }; type: string }> = [];
  const ctx = {
    state: over.state ?? "running",
    currentTime: 0,
    resume: over.resume ?? vi.fn(async () => {}),
    destination: {} as unknown,
    createOscillator: vi.fn(() => {
      const osc = {
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn((t: number) => started.push(t)),
        stop: vi.fn((t: number) => stopped.push(t)),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(
      (): FakeNode & { gain: Record<string, ReturnType<typeof vi.fn>> } => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }),
    ),
  };
  return { ctx, started, stopped, oscillators };
}

/** jsdom has no AudioContext, so each test installs its own. */
function install(ctx: unknown) {
  const factory = vi.fn(() => ctx);
  vi.stubGlobal("AudioContext", factory);
  return factory;
}

beforeEach(() => {
  __resetNotificationSoundForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetNotificationSoundForTest();
});

describe("notificationSoundSupported", () => {
  it("is false without an AudioContext (jsdom, SSR)", () => {
    expect(notificationSoundSupported()).toBe(false);
  });

  it("is true once AudioContext exists", () => {
    install(fakeContext().ctx);
    expect(notificationSoundSupported()).toBe(true);
  });
});

describe("playNotificationSound", () => {
  it("no-ops (without throwing) when WebAudio is unavailable", () => {
    expect(() => playNotificationSound()).not.toThrow();
  });

  it("plays the two-note chime through the destination", () => {
    const { ctx, started, stopped, oscillators } = fakeContext();
    install(ctx);

    playNotificationSound();

    expect(oscillators).toHaveLength(2);
    expect(oscillators.map((o) => o.frequency.value)).toEqual([660, 880]);
    expect(oscillators.every((o) => o.type === "sine")).toBe(true);
    // Second note starts after the first and every note is bounded.
    expect(started[1]).toBeGreaterThan(started[0]!);
    stopped.forEach((t, i) => expect(t).toBeGreaterThan(started[i]!));
  });

  it("reuses one AudioContext across plays (no handle leak under a burst)", () => {
    const factory = install(fakeContext().ctx);
    playNotificationSound();
    playNotificationSound();
    playNotificationSound();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("resumes a context suspended by the autoplay policy", () => {
    const { ctx } = fakeContext({ state: "suspended" });
    install(ctx);
    playNotificationSound();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("swallows a rejected resume() (still gesture-blocked)", async () => {
    const { ctx } = fakeContext({
      state: "suspended",
      resume: () => Promise.reject(new Error("NotAllowedError")),
    });
    install(ctx);
    expect(() => playNotificationSound()).not.toThrow();
    // An unhandled rejection would surface here if the catch were missing.
    await Promise.resolve();
  });

  it("swallows a throwing audio API", () => {
    const { ctx } = fakeContext();
    ctx.createOscillator = vi.fn(() => {
      throw new Error("audio hardware gone");
    }) as never;
    install(ctx);
    expect(() => playNotificationSound()).not.toThrow();
  });

  it("swallows a throwing AudioContext constructor", () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => {
        throw new Error("blocked");
      }),
    );
    expect(() => playNotificationSound()).not.toThrow();
  });
});
