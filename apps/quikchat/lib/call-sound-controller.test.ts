// Call-sound lifecycle. The call page is untestable in jsdom (no ontrack-capable
// RTCPeerConnection, dynamic socket.io import, getUserMedia), so the risky part —
// what starts, what stops, and what must never double-fire — lives here where it
// can be driven directly.
import { beforeEach, describe, expect, it, vi } from "vitest";

const audio = {
  startRingback: vi.fn(),
  playConnectedTone: vi.fn(),
  playEndedTone: vi.fn(),
  stopRingback: vi.fn(),
};
vi.mock("./call-sounds", () => ({
  startRingback: () => {
    audio.startRingback();
    return audio.stopRingback;
  },
  playConnectedTone: () => audio.playConnectedTone(),
  playEndedTone: () => audio.playEndedTone(),
}));

import { createCallSoundController } from "./call-sound-controller";

/** The common case: settings resolved with call sounds on. */
function enabled() {
  const c = createCallSoundController();
  c.setEnabled(true);
  return c;
}

beforeEach(() => {
  audio.startRingback.mockReset();
  audio.playConnectedTone.mockReset();
  audio.playEndedTone.mockReset();
  audio.stopRingback.mockReset();
});

describe("enabled gating", () => {
  it("is silent before the settings fetch resolves", () => {
    const c = createCallSoundController();
    c.startRingback();
    c.connected();
    c.ended();
    expect(audio.startRingback).not.toHaveBeenCalled();
    expect(audio.playConnectedTone).not.toHaveBeenCalled();
    expect(audio.playEndedTone).not.toHaveBeenCalled();
  });

  it("is silent when the user disabled call sounds", () => {
    const c = createCallSoundController();
    c.setEnabled(false);
    c.startRingback();
    c.ended();
    expect(audio.startRingback).not.toHaveBeenCalled();
    expect(audio.playEndedTone).not.toHaveBeenCalled();
  });

  it("plays once enabled", () => {
    const c = enabled();
    c.startRingback();
    expect(audio.startRingback).toHaveBeenCalledTimes(1);
  });

  it("disabling mid-call silences a ringback already looping", () => {
    const c = enabled();
    c.startRingback();
    c.setEnabled(false);
    expect(audio.stopRingback).toHaveBeenCalledTimes(1);
  });
});

describe("ringback lifecycle", () => {
  it("stops on connected — the path cleanup() cannot cover", () => {
    const c = enabled();
    c.startRingback();
    c.connected();
    expect(audio.stopRingback).toHaveBeenCalledTimes(1);
  });

  it("stops on ended", () => {
    const c = enabled();
    c.startRingback();
    c.ended();
    expect(audio.stopRingback).toHaveBeenCalledTimes(1);
  });

  it("stops on stopAll (the cleanup() funnel)", () => {
    const c = enabled();
    c.startRingback();
    c.stopAll();
    expect(audio.stopRingback).toHaveBeenCalledTimes(1);
  });

  it("never starts a second overlapping loop", () => {
    const c = enabled();
    c.startRingback();
    c.startRingback();
    c.startRingback();
    expect(audio.startRingback).toHaveBeenCalledTimes(1);
  });

  it("can ring again after a full stop (retry re-inits the call)", () => {
    const c = enabled();
    c.startRingback();
    c.stopAll();
    c.startRingback();
    expect(audio.startRingback).toHaveBeenCalledTimes(2);
  });

  it("stopAll is idempotent and safe with nothing playing", () => {
    const c = enabled();
    expect(() => {
      c.stopAll();
      c.stopAll();
    }).not.toThrow();
    expect(audio.stopRingback).not.toHaveBeenCalled();

    c.startRingback();
    c.stopAll();
    c.stopAll();
    expect(audio.stopRingback).toHaveBeenCalledTimes(1); // handle dropped after the first
  });

});

describe("connected tone", () => {
  // The caller fires connected() on call:answer AND again on the first ontrack;
  // the callee only ever gets ontrack. Both must end up with exactly one chime.
  it("plays exactly once across both triggers (caller)", () => {
    const c = enabled();
    c.startRingback();
    c.connected(); // call:answer
    c.connected(); // first ontrack
    c.connected(); // further tracks (video after audio)
    expect(audio.playConnectedTone).toHaveBeenCalledTimes(1);
  });

  it("plays for the callee, who only gets ontrack", () => {
    const c = enabled(); // callee never calls startRingback
    c.connected();
    expect(audio.playConnectedTone).toHaveBeenCalledTimes(1);
    expect(audio.startRingback).not.toHaveBeenCalled();
  });

  it("is silent when call sounds are off", () => {
    const c = createCallSoundController();
    c.setEnabled(false);
    c.connected();
    expect(audio.playConnectedTone).not.toHaveBeenCalled();
  });
});

describe("ended tone", () => {
  it("plays on ended", () => {
    const c = enabled();
    c.ended();
    expect(audio.playEndedTone).toHaveBeenCalledTimes(1);
  });

  it("plays even if the call never connected (cancelled while ringing)", () => {
    const c = enabled();
    c.startRingback();
    c.ended();
    expect(audio.stopRingback).toHaveBeenCalledTimes(1);
    expect(audio.playEndedTone).toHaveBeenCalledTimes(1);
  });
});

describe("full call arcs", () => {
  it("caller: ring → answer → hang up leaves nothing playing", () => {
    const c = enabled();
    c.startRingback();
    c.connected();
    c.ended();
    c.stopAll(); // cleanup()
    expect(audio.startRingback).toHaveBeenCalledTimes(1);
    expect(audio.stopRingback).toHaveBeenCalledTimes(1); // handle dropped, not re-stopped
    expect(audio.playConnectedTone).toHaveBeenCalledTimes(1);
    expect(audio.playEndedTone).toHaveBeenCalledTimes(1);
  });

  it("caller: ring → declined (cleanup only) leaves nothing playing", () => {
    const c = enabled();
    c.startRingback();
    c.stopAll();
    expect(audio.stopRingback).toHaveBeenCalledTimes(1);
    expect(audio.playConnectedTone).not.toHaveBeenCalled();
  });
});
