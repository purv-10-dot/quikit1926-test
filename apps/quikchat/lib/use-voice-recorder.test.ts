// @vitest-environment jsdom
/**
 * Voice-recorder hook. jsdom has neither MediaRecorder nor navigator.mediaDevices,
 * so both are faked here. The fakes' tracks expose a spied `stop()` — that spy is
 * how we assert the ONE hard invariant: the mic is released on every exit path
 * (stop, cancel, unmount mid-recording, error).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_STORAGE_KEY } from "./media-devices";
import {
  baseMimeType,
  useVoiceRecorder,
  voiceFileExtension,
  VOICE_MAX_SEC,
} from "./use-voice-recorder";

class FakeTrack {
  kind = "audio";
  stop = vi.fn();
}

class FakeStream {
  tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  /** Types `isTypeSupported` will admit — narrowed per-test to force fallbacks. */
  static supported: string[] = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (t: string) => FakeMediaRecorder.supported.includes(t);

  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  /** Bytes the next stop() emits — set to "" to model a zero-length capture. */
  payload = "audio-bytes";

  constructor(
    public stream: FakeStream,
    opts?: { mimeType?: string },
  ) {
    this.mimeType = opts?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    // Real browsers flush `dataavailable` before `stop` — the hook relies on it.
    if (this.payload) this.ondataavailable?.({ data: new Blob([this.payload]) });
    this.onstop?.();
  }
}

let stream: FakeStream;
let getUserMedia: ReturnType<typeof vi.fn>;

function tracksOf(s: FakeStream = stream) {
  return s.tracks;
}

beforeEach(() => {
  localStorage.clear();
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supported = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  stream = new FakeStream();
  getUserMedia = vi.fn().mockResolvedValue(stream);
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
});

describe("baseMimeType / voiceFileExtension", () => {
  it("strips the codec parameter (the value the upload allowlist must see)", () => {
    // The allowlist is an exact-match includes(); "audio/webm;codecs=opus" would
    // be rejected by both validateFile and /api/uploads/sign.
    expect(baseMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMimeType("AUDIO/MP4")).toBe("audio/mp4");
    expect(baseMimeType(undefined)).toBe("");
  });

  it("maps base MIME to a file extension", () => {
    expect(voiceFileExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(voiceFileExtension("audio/mp4")).toBe("m4a");
    expect(voiceFileExtension("audio/ogg")).toBe("ogg");
    expect(voiceFileExtension("audio/wav")).toBe("wav");
    expect(voiceFileExtension("audio/mpeg")).toBe("mp3");
    expect(voiceFileExtension("something/else")).toBe("webm");
  });
});

describe("useVoiceRecorder", () => {
  it("reports supported after mount and starts recording on the default mic", async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(result.current.state).toBe("idle");

    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.state).toBe("recording");
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("prefers opus webm, then falls back through webm → mp4", async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(FakeMediaRecorder.instances[0]!.mimeType).toBe("audio/webm;codecs=opus");

    FakeMediaRecorder.supported = ["audio/webm", "audio/mp4"];
    const second = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await second.result.current.start();
    });
    expect(FakeMediaRecorder.instances[1]!.mimeType).toBe("audio/webm");

    // Safari: only audio/mp4 — the reason audio/mp4 joined the allowlist.
    FakeMediaRecorder.supported = ["audio/mp4"];
    const third = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await third.result.current.start();
    });
    expect(FakeMediaRecorder.instances[2]!.mimeType).toBe("audio/mp4");
  });

  it("stop() returns the blob with the measured duration + base MIME, and releases the mic", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(result.current.elapsedSec).toBe(3);

    let recording: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      recording = await result.current.stop();
    });

    expect(recording).not.toBeNull();
    expect(recording!.durationSec).toBe(3);
    // Codec param stripped — this is the value that reaches the File + upload.
    expect(recording!.mimeType).toBe("audio/webm");
    expect(recording!.blob.size).toBeGreaterThan(0);
    expect(result.current.state).toBe("idle");
    expect(result.current.elapsedSec).toBe(0);
    // Mic released.
    expect(tracksOf()[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("stop() returns null when nothing was captured", async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    FakeMediaRecorder.instances[0]!.payload = "";

    let recording: unknown = "unset";
    await act(async () => {
      recording = await result.current.stop();
    });
    expect(recording).toBeNull();
    expect(tracksOf()[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("cancel() discards the recording and releases the mic", async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.elapsedSec).toBe(0);
    expect(tracksOf()[0]!.stop).toHaveBeenCalledTimes(1);
    // Nothing left to hand back — a second stop can't resurrect the bytes.
    let after: unknown = "unset";
    await act(async () => {
      after = await result.current.stop();
    });
    expect(after).toBeNull();
  });

  it("unmounting mid-recording releases the mic (no lingering recording indicator)", async () => {
    const { result, unmount } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    const recorder = FakeMediaRecorder.instances[0]!;
    expect(recorder.state).toBe("recording");

    unmount();

    expect(tracksOf()[0]!.stop).toHaveBeenCalledTimes(1);
    expect(recorder.state).toBe("inactive");
  });

  it("unmounting while the permission prompt is open still releases the mic", async () => {
    // getUserMedia resolves AFTER unmount — the stream must never go hot.
    let resolveMedia: (s: FakeStream) => void = () => {};
    getUserMedia.mockImplementation(() => new Promise((res) => (resolveMedia = res)));
    const late = new FakeStream();

    const { result, unmount } = renderHook(() => useVoiceRecorder());
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start();
    });
    unmount();
    await act(async () => {
      resolveMedia(late);
      await started;
    });

    expect(late.tracks[0]!.stop).toHaveBeenCalledTimes(1);
    // No recorder was ever constructed for the late stream.
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it("stops the elapsed timer on unmount", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { result, unmount } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    unmount();
    expect(clearSpy).toHaveBeenCalled();

    // Advancing further must not tick anything (no setState-after-unmount).
    const ticksBefore = FakeMediaRecorder.instances.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(FakeMediaRecorder.instances).toHaveLength(ticksBefore);
  });

  it("auto-stops at the 5-minute cap and hands the recording to onAutoStop", async () => {
    expect(VOICE_MAX_SEC).toBe(300);
    vi.useFakeTimers();
    const onAutoStop = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder({ onAutoStop }));
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_MAX_SEC * 1000);
    });

    expect(result.current.state).toBe("idle");
    expect(onAutoStop).toHaveBeenCalledTimes(1);
    // The capped recording is handed over, never silently discarded.
    expect(onAutoStop.mock.calls[0]![0]).toMatchObject({
      durationSec: VOICE_MAX_SEC,
      mimeType: "audio/webm",
    });
    expect(tracksOf()[0]!.stop).toHaveBeenCalledTimes(1);

    // The timer is gone: no further ticks, no second auto-stop.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(onAutoStop).toHaveBeenCalledTimes(1);
  });

  it("caps the reported duration at maxSec", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceRecorder({ maxSec: 5 }));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    let recording: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      recording = await result.current.stop();
    });
    expect(recording!.durationSec).toBe(4);
  });

  it("reports a denied-permission error without throwing, and grabs no mic", async () => {
    const denied = new Error("Permission denied");
    denied.name = "NotAllowedError";
    getUserMedia.mockRejectedValue(denied);

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/Microphone access was blocked/);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(tracksOf()[0]!.stop).not.toHaveBeenCalled();
  });

  it("reports a missing device", async () => {
    const missing = new Error("no device");
    missing.name = "NotFoundError";
    getUserMedia.mockRejectedValue(missing);

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("No microphone found.");
  });

  it("a recorder error releases the mic and surfaces an error state", async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      FakeMediaRecorder.instances[0]!.onerror?.();
    });

    expect(result.current.state).toBe("error");
    expect(tracksOf()[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("start() is a no-op while already recording (one mic grab, one recorder)", async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("records from the microphone chosen in Settings → Devices", async () => {
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ micId: "mic-headset" }));
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "mic-headset" } },
    });
    expect(result.current.state).toBe("recording");
  });

  it("falls back to the default mic when the saved device is gone (stale id)", async () => {
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ micId: "mic-unplugged" }));
    const gone = new Error("device not found");
    gone.name = "OverconstrainedError";
    getUserMedia.mockRejectedValueOnce(gone).mockResolvedValueOnce(stream);

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    // Recording proceeds on the default mic rather than erroring out.
    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      audio: { deviceId: { exact: "mic-unplugged" } },
    });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: true });
    expect(result.current.state).toBe("recording");

    // The stale preference is left alone — a replugged device is remembered.
    expect(JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY)!).micId).toBe("mic-unplugged");
  });

  it("does NOT retry a denied permission (no re-prompt loop) even with a saved mic", async () => {
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ micId: "mic-headset" }));
    const denied = new Error("Permission denied");
    denied.name = "NotAllowedError";
    getUserMedia.mockRejectedValue(denied);

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/Microphone access was blocked/);
  });

  it("surfaces the fallback's failure when the default mic also fails", async () => {
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ micId: "mic-unplugged" }));
    const gone = new Error("gone");
    gone.name = "OverconstrainedError";
    const noDevice = new Error("none");
    noDevice.name = "NotFoundError";
    getUserMedia.mockRejectedValueOnce(gone).mockRejectedValueOnce(noDevice);

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("No microphone found.");
  });

  it("reports unsupported when MediaRecorder is absent", async () => {
    delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    const { result } = renderHook(() => useVoiceRecorder());
    await waitFor(() => expect(result.current.supported).toBe(false));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("error");
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
