// @vitest-environment jsdom
/**
 * Voice-typing hook. jsdom has no SpeechRecognition, so it's faked here. The
 * fake spies on `abort()` and `stop()` — those spies are how we assert the ONE
 * hard invariant, mirroring `use-voice-recorder.test.ts`: the recognition
 * session (and with it the mic) is released on every exit path — manual stop,
 * cancel, error, engine-initiated end, and unmount mid-listen.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SPEECH_LANG,
  getSpeechLang,
  isSpeechToTextSupported,
  setSpeechLang,
  speechErrorMessage,
  SPEECH_LANG_STORAGE_KEY,
  useSpeechToText,
} from "./use-speech-to-text";

/** One alternative, one result — the shape `onresult` reads. */
function resultList(entries: Array<{ transcript: string; isFinal: boolean }>) {
  const results = entries.map((e) => ({
    length: 1,
    isFinal: e.isFinal,
    0: { transcript: e.transcript, confidence: 0.9 },
    item: (i: number) => ({ transcript: e.transcript, confidence: 0.9 })[i as never],
  }));
  return Object.assign(results, { length: results.length, item: (i: number) => results[i] });
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: ((e: Event) => void) | null = null;
  onstart: ((e: Event) => void) | null = null;
  start = vi.fn();
  /** Graceful: the engine may still deliver a queued final result, then ends. */
  stop = vi.fn(() => {
    this.onend?.(new Event("end"));
  });
  abort = vi.fn();
  constructor() {
    FakeRecognition.instances.push(this);
  }

  // --- test helpers that model what the engine does ---
  emit(entries: Array<{ transcript: string; isFinal: boolean }>, resultIndex = 0) {
    this.onresult?.({ resultIndex, results: resultList(entries) });
  }
  fail(code: string) {
    this.onerror?.({ error: code, message: "" });
  }
  end() {
    this.onend?.(new Event("end"));
  }
}

const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1]!;

function installRecognition(key: "SpeechRecognition" | "webkitSpeechRecognition" = "SpeechRecognition") {
  (window as unknown as Record<string, unknown>)[key] = FakeRecognition;
}

beforeEach(() => {
  localStorage.clear();
  FakeRecognition.instances = [];
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isSpeechToTextSupported", () => {
  it("is false when neither constructor exists (Firefox / Opera)", () => {
    expect(isSpeechToTextSupported()).toBe(false);
  });
  it("accepts the unprefixed constructor", () => {
    installRecognition("SpeechRecognition");
    expect(isSpeechToTextSupported()).toBe(true);
  });
  it("accepts the webkit-prefixed constructor", () => {
    installRecognition("webkitSpeechRecognition");
    expect(isSpeechToTextSupported()).toBe(true);
  });
});

describe("speech language persistence", () => {
  it("defaults to en-IN with nothing stored", () => {
    expect(getSpeechLang()).toBe(DEFAULT_SPEECH_LANG);
    expect(DEFAULT_SPEECH_LANG).toBe("en-IN");
  });
  it("round-trips a stored choice", () => {
    setSpeechLang("hi-IN");
    expect(localStorage.getItem(SPEECH_LANG_STORAGE_KEY)).toBe("hi-IN");
    expect(getSpeechLang()).toBe("hi-IN");
  });
  it("falls back to the default on a junk value", () => {
    localStorage.setItem(SPEECH_LANG_STORAGE_KEY, "kl-KL");
    expect(getSpeechLang()).toBe("en-IN");
  });
});

describe("speechErrorMessage", () => {
  it("maps each SpeechRecognition error code to its own message", () => {
    const codes = [
      "not-allowed",
      "service-not-allowed",
      "no-speech",
      "audio-capture",
      "network",
      "language-not-supported",
    ];
    const messages = codes.map(speechErrorMessage);
    // Every branch produces a non-empty, human sentence...
    for (const m of messages) expect(m.length).toBeGreaterThan(10);
    // ...and permission vs. no-mic vs. network are distinguishable.
    expect(speechErrorMessage("not-allowed")).toMatch(/blocked/i);
    expect(speechErrorMessage("audio-capture")).toMatch(/no microphone/i);
    expect(speechErrorMessage("network")).toMatch(/network/i);
    expect(speechErrorMessage("wat")).toBe("Voice typing stopped unexpectedly.");
  });
});

describe("useSpeechToText", () => {
  it("reports unsupported without a constructor and errors if started anyway", async () => {
    const { result } = renderHook(() => useSpeechToText());
    await waitFor(() => expect(result.current.supported).toBe(false));
    act(() => result.current.start("en-IN"));
    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/isn't supported/i);
  });

  it("start() configures the session for continuous interim results in the given locale", async () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    await waitFor(() => expect(result.current.supported).toBe(true));

    act(() => result.current.start("hi-IN"));

    expect(result.current.state).toBe("listening");
    const session = latest();
    expect(session.lang).toBe("hi-IN");
    expect(session.continuous).toBe(true);
    expect(session.interimResults).toBe(true);
    expect(session.start).toHaveBeenCalledTimes(1);
  });

  it("surfaces interim text and forwards it as not-final", async () => {
    installRecognition();
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechToText({ onResult }));
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));

    act(() => latest().emit([{ transcript: "hello", isFinal: false }]));
    expect(result.current.interimText).toBe("hello");
    expect(onResult).toHaveBeenLastCalledWith("hello", false);

    act(() => latest().emit([{ transcript: "hello world", isFinal: false }]));
    expect(result.current.interimText).toBe("hello world");
    expect(onResult).toHaveBeenLastCalledWith("hello world", false);
  });

  it("a final result is forwarded as final and clears the interim text", async () => {
    installRecognition();
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechToText({ onResult }));
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));

    act(() => latest().emit([{ transcript: "hello", isFinal: false }]));
    act(() => latest().emit([{ transcript: "hello world", isFinal: true }]));

    expect(onResult).toHaveBeenLastCalledWith("hello world", true);
    expect(result.current.interimText).toBe("");
    // Still listening — `continuous` means one final result doesn't end the session.
    expect(result.current.state).toBe("listening");
  });

  it("honours resultIndex so already-committed segments are not re-emitted", async () => {
    installRecognition();
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechToText({ onResult }));
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));

    // The engine's list holds an earlier committed segment at index 0 and the
    // new one at index 1; resultIndex says "only 1 changed".
    act(() =>
      latest().emit(
        [
          { transcript: "already sent", isFinal: true },
          { transcript: "new words", isFinal: false },
        ],
        1,
      ),
    );

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("new words", false);
  });

  it("maps an error to state+message and RELEASES the session", async () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));
    const session = latest();

    act(() => session.fail("not-allowed"));

    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/blocked/i);
    expect(session.abort).toHaveBeenCalled();
    expect(session.onresult).toBeNull(); // handlers detached before abort
  });

  it("ignores the self-inflicted 'aborted' error", async () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));

    act(() => latest().fail("aborted"));

    expect(result.current.state).toBe("listening");
    expect(result.current.error).toBeUndefined();
  });

  it("stop() is graceful and returns to idle via onend, releasing the session", async () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));
    const session = latest();

    act(() => result.current.stop());

    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("idle");
    expect(session.abort).toHaveBeenCalled(); // teardown ran from onend
  });

  it("an engine-initiated end (silence timeout) returns to idle and releases", async () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));
    const session = latest();

    act(() => session.end());

    expect(result.current.state).toBe("idle");
    expect(session.abort).toHaveBeenCalled();
  });

  it("cancel() discards in-flight results — no stop(), straight to abort()", async () => {
    installRecognition();
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechToText({ onResult }));
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));
    const session = latest();
    act(() => session.emit([{ transcript: "half a sen", isFinal: false }]));
    onResult.mockClear();

    act(() => result.current.cancel());

    expect(session.stop).not.toHaveBeenCalled();
    expect(session.abort).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    expect(result.current.interimText).toBe("");
    // Handlers are detached, so a late final result can't reach the caller.
    act(() => session.onresult?.({ resultIndex: 0, results: resultList([]) }));
    expect(onResult).not.toHaveBeenCalled();
  });

  it("unmounting mid-listen aborts the session (the mic-release invariant)", async () => {
    installRecognition();
    const { result, unmount } = renderHook(() => useSpeechToText());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));
    const session = latest();

    unmount();

    expect(session.abort).toHaveBeenCalled();
    expect(session.onresult).toBeNull();
    expect(session.onend).toBeNull();
  });

  it("start() while already listening does not stack a second session", async () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start("en-IN"));
    act(() => result.current.start("hi-IN"));
    expect(FakeRecognition.instances).toHaveLength(1);
  });
});
