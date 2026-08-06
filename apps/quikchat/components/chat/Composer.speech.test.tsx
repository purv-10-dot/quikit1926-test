// @vitest-environment jsdom
/**
 * Composer voice typing (dictation): the Web Speech API result stream becomes
 * text IN THE EDITOR, not an attachment. The points these tests pin down:
 *   - interim results REPLACE one live span instead of appending duplicates
 *   - Send stops dictation and sends what's visible (it never blocks, unlike a
 *     voice recording, and a late final result can't leak into a cleared box)
 *   - dictation and voice-note/attach are mutually exclusive in both directions
 *   - the locale toggle persists per machine
 */
import { ToastProvider } from "@/components/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPEECH_LANG_STORAGE_KEY } from "@/lib/use-speech-to-text";

vi.mock("@/lib/api", () => ({ signUploadApi: vi.fn() }));

function resultList(entries: Array<{ transcript: string; isFinal: boolean }>) {
  const results = entries.map((e) => ({
    length: 1,
    isFinal: e.isFinal,
    0: { transcript: e.transcript, confidence: 0.9 },
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
  stop = vi.fn(() => this.onend?.(new Event("end")));
  abort = vi.fn();
  constructor() {
    FakeRecognition.instances.push(this);
  }
  emit(entries: Array<{ transcript: string; isFinal: boolean }>, resultIndex = 0) {
    this.onresult?.({ resultIndex, results: resultList(entries) });
  }
}

const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1]!;

// jsdom has no MediaRecorder either; the voice-note button must exist for the
// mutual-exclusion tests, so give it the minimum it probes for.
class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["bytes"]) });
    this.onstop?.();
  }
}

import { Composer } from "./Composer";

const members = [{ id: "u1", displayName: "Alice" }];

function renderComposer(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn();
  render(
    <ToastProvider>
      <Composer
        members={members}
        onSend={onSend}
        channelId="c1"
        onSendMedia={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  );
  return onSend;
}

// The toolbar toggle keeps a stable name and reports state via aria-pressed, so
// this query is state-independent (and can't collide with the bar's Stop button
// or the locale pill's "Dictation language: …").
const dictateButton = () => screen.getByRole("button", { name: /^Voice typing \(/ });
const stopDictateButton = () => screen.getByRole("button", { name: "Stop voice typing" });
const attachButton = () => screen.getByRole("button", { name: "Attach file" });
const micButton = () => screen.getByRole("button", { name: "Record voice message" });
const langToggle = () => screen.getByTestId("speech-lang-toggle");
const editorText = () => document.querySelector(".qc-composer__editor")?.textContent ?? "";

/** Tap the dictate button and wait for the listening bar. */
async function startDictation() {
  fireEvent.click(dictateButton());
  await screen.findByTestId("dictation-bar");
}

beforeEach(() => {
  localStorage.clear();
  FakeRecognition.instances = [];
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
    configurable: true,
    writable: true,
  });
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:x";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  vi.restoreAllMocks();
});

describe("Composer voice typing", () => {
  it("hides the button entirely when SpeechRecognition is unavailable (Firefox / Opera)", async () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    renderComposer();
    // The attach button proves the composer rendered; dictation is simply absent
    // — not shown disabled.
    await waitFor(() => expect(attachButton()).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^Voice typing \(/ })).toBeNull();
    expect(screen.queryByTestId("speech-lang-toggle")).toBeNull();
  });

  it("tapping it shows a listening bar naming the locale and the privacy caveat", async () => {
    renderComposer();
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    await startDictation();

    const bar = screen.getByTestId("dictation-bar");
    expect(bar).toHaveTextContent(/Listening · English only/);
    // The vendor-server disclosure is in the UI, not just a code comment.
    expect(bar).toHaveTextContent(/browser's speech service/i);
    expect(stopDictateButton()).toBeInTheDocument();
    expect(latest().lang).toBe("en-IN");
  });

  it("interim results REPLACE the live span instead of appending duplicates", async () => {
    renderComposer();
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    await startDictation();

    act(() => latest().emit([{ transcript: "let us", isFinal: false }]));
    expect(editorText()).toContain("let us");

    act(() => latest().emit([{ transcript: "let us meet", isFinal: false }]));
    // The regression this guards: appending would leave "let uslet us meet".
    expect(editorText()).toContain("let us meet");
    expect(editorText()).not.toContain("let uslet us");
  });

  it("a final result commits the span and the next utterance starts a fresh one", async () => {
    renderComposer();
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    await startDictation();

    act(() => latest().emit([{ transcript: "hello", isFinal: false }]));
    act(() => latest().emit([{ transcript: "hello there", isFinal: true }]));
    expect(editorText()).toContain("hello there");

    // A fresh utterance must APPEND after the committed text, not overwrite it.
    // The engine keeps the committed segment in the list and points resultIndex
    // at the new one, so the fixture carries both.
    act(() =>
      latest().emit(
        [
          { transcript: "hello there", isFinal: true },
          { transcript: "how are you", isFinal: false },
        ],
        1,
      ),
    );
    expect(editorText()).toContain("hello there");
    expect(editorText()).toContain("how are you");
  });

  it("Send stops dictation and sends the visible text (never blocked)", async () => {
    const onSend = renderComposer();
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    await startDictation();
    act(() => latest().emit([{ transcript: "ship it", isFinal: false }]));
    const session = latest();

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]![0]).toContain("ship it");
    // cancel(), not stop(): a queued final result must not land in the cleared box.
    expect(session.abort).toHaveBeenCalled();
    expect(session.stop).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dictation-bar")).toBeNull();
  });

  it("a late final result after Send cannot leak into the emptied composer", async () => {
    renderComposer();
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    await startDictation();
    act(() => latest().emit([{ transcript: "sent already", isFinal: false }]));
    const session = latest();

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    // The engine tries to deliver one more segment; handlers are detached.
    act(() => session.onresult?.({ resultIndex: 0, results: resultList([]) }));

    expect(editorText()).not.toContain("sent already");
  });

  it("the Stop button in the bar is graceful — the last words still commit", async () => {
    renderComposer();
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    await startDictation();
    const session = latest();

    fireEvent.click(stopDictateButton());

    expect(session.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("dictation-bar")).toBeNull());
  });

  it("blocks attach and voice-note recording while listening", async () => {
    renderComposer();
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    await startDictation();

    expect(attachButton()).toBeDisabled();
    expect(micButton()).toBeDisabled();
  });

  it("blocks dictation while a voice note is recording", async () => {
    renderComposer();
    await waitFor(() => expect(micButton()).toBeInTheDocument());

    fireEvent.click(micButton());
    await screen.findByTestId("voice-recording-bar");

    expect(dictateButton()).toBeDisabled();
  });

  it("blocks dictation while a file is staged", async () => {
    renderComposer();
    await waitFor(() => expect(attachButton()).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });
    await screen.findByTestId("attach-preview");

    expect(dictateButton()).toBeDisabled();
  });

  it("dictation needs no channel — it produces text, not an attachment", async () => {
    renderComposer({ channelId: undefined, onSendMedia: undefined });
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    // Attach is unusable without a channel; dictation is unaffected.
    expect(attachButton()).toBeDisabled();
    expect(dictateButton()).not.toBeDisabled();
  });

  it("the locale toggle flips, persists per machine, and arms the next session", async () => {
    renderComposer();
    await waitFor(() => expect(langToggle()).toBeInTheDocument());
    expect(langToggle()).toHaveTextContent("EN");

    fireEvent.click(langToggle());

    expect(langToggle()).toHaveTextContent("हि");
    expect(localStorage.getItem(SPEECH_LANG_STORAGE_KEY)).toBe("hi-IN");
    await startDictation();
    expect(latest().lang).toBe("hi-IN");
  });

  it("restores the saved locale on remount", async () => {
    localStorage.setItem(SPEECH_LANG_STORAGE_KEY, "hi-IN");
    renderComposer();
    await waitFor(() => expect(langToggle()).toHaveTextContent("हि"));
  });

  it("locks the locale toggle while listening (one locale per session)", async () => {
    renderComposer();
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    await startDictation();
    expect(langToggle()).toBeDisabled();
  });

  it("toasts a permission failure and leaves the bar closed", async () => {
    renderComposer();
    await waitFor(() => expect(dictateButton()).toBeInTheDocument());
    await startDictation();

    act(() => latest().onerror?.({ error: "not-allowed", message: "" }));

    expect(await screen.findByText(/blocked/i)).toBeInTheDocument();
    expect(screen.queryByTestId("dictation-bar")).toBeNull();
  });
});
