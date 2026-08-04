// @vitest-environment jsdom
/**
 * Composer voice notes: record → stop → the blob stages as an ordinary `pending`
 * attachment → the EXISTING Send/upload path posts it. The point of these tests is
 * that no parallel send path exists — Send drives `signUploadApi` + `onSendMedia`
 * exactly as it does for a picked file — and that recording and file-attach are
 * mutually exclusive in both directions.
 */
import { ToastProvider } from "@/components/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUploadApi = vi.fn();
vi.mock("@/lib/api", () => ({ signUploadApi: (...a: unknown[]) => signUploadApi(...a) }));

class FakeXHR {
  status = 200;
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  send() {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 } as ProgressEvent);
    this.onload?.();
  }
}

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
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (t: string) => t === "audio/webm;codecs=opus";
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
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
    this.ondataavailable?.({ data: new Blob(["voice-bytes"]) });
    this.onstop?.();
  }
}

import { Composer } from "./Composer";

const members = [{ id: "u1", displayName: "Alice" }];
let stream: FakeStream;
let getUserMedia: ReturnType<typeof vi.fn>;

function renderComposer(onSendMedia = vi.fn()) {
  render(
    <ToastProvider>
      <Composer members={members} onSend={vi.fn()} channelId="c1" onSendMedia={onSendMedia} />
    </ToastProvider>,
  );
  return onSendMedia;
}

const micButton = () => screen.getByRole("button", { name: "Record voice message" });
const attachButton = () => screen.getByRole("button", { name: "Attach file" });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

/** Tap the mic and wait for the recording bar. */
async function startRecording() {
  fireEvent.click(micButton());
  await screen.findByTestId("voice-recording-bar");
}

beforeEach(() => {
  signUploadApi.mockReset();
  FakeMediaRecorder.instances = [];
  stream = new FakeStream();
  getUserMedia = vi.fn().mockResolvedValue(stream);
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  });
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:voice";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
  signUploadApi.mockResolvedValue({
    uploadUrl: "/api/uploads/local/tok",
    method: "PUT",
    headers: { "Content-Type": "audio/webm" },
    objectPath: "quikchat/o/c/uuid-voice-message.webm",
    maxBytes: 1024,
    expiresAt: new Date().toISOString(),
  });
});

afterEach(() => {
  delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  vi.restoreAllMocks();
});

describe("Composer voice notes (record → stage → existing send path)", () => {
  it("hides the mic button when MediaRecorder is unsupported", async () => {
    delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    renderComposer();
    // The attach button proves the composer rendered; the mic is simply absent.
    await waitFor(() => expect(attachButton()).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Record voice message" })).toBeNull();
  });

  it("tapping the mic shows the recording bar with a live timer", async () => {
    renderComposer();
    await startRecording();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(screen.getByTestId("voice-elapsed")).toHaveTextContent("0:00");
    expect(screen.getByRole("button", { name: "Cancel recording" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
  });

  it("stopping stages a voice-message chip (not a file thumbnail) and does NOT upload yet", async () => {
    const onSendMedia = renderComposer();
    await startRecording();

    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));

    const chip = await screen.findByTestId("attach-preview");
    expect(chip).toHaveTextContent(/Voice message · \d+:\d{2}/);
    expect(screen.getByRole("button", { name: "Discard voice message" })).toBeInTheDocument();
    // Recording UI gone, mic released.
    expect(screen.queryByTestId("voice-recording-bar")).toBeNull();
    expect(stream.tracks[0]!.stop).toHaveBeenCalledTimes(1);
    // Staged only — the upload happens on Send, same as a picked file.
    expect(signUploadApi).not.toHaveBeenCalled();
    expect(onSendMedia).not.toHaveBeenCalled();
  });

  it("Send uploads the staged recording and posts it with durationSec", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSendMedia = renderComposer();
    await startRecording();
    // Let the hook measure ~2s of elapsed time so a real duration is persisted.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await screen.findByTestId("attach-preview");
    vi.useRealTimers();

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSendMedia).toHaveBeenCalled());
    const [meta, caption, localUrl] = onSendMedia.mock.calls[0]!;
    expect(meta).toMatchObject({
      objectPath: "quikchat/o/c/uuid-voice-message.webm",
      // Codec parameter stripped — the allowlisted value, not "audio/webm;codecs=opus".
      mediaType: "audio/webm",
      durationSec: 2,
    });
    expect(meta.originalName).toMatch(/^voice-message-\d+\.webm$/);
    expect(caption).toBe("");
    expect(localUrl).toBe("blob:voice");
    // The chip clears, exactly as the file-attach flow does.
    await waitFor(() => expect(screen.queryByTestId("attach-preview")).toBeNull());
  });

  it("the signed upload asks for the allowlisted base MIME", async () => {
    renderComposer();
    await startRecording();
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await screen.findByTestId("attach-preview");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(signUploadApi).toHaveBeenCalled());
    expect(signUploadApi.mock.calls[0]![0]).toMatchObject({
      channelId: "c1",
      contentType: "audio/webm",
    });
  });

  it("cancelling mid-recording discards it and releases the mic", async () => {
    const onSendMedia = renderComposer();
    await startRecording();

    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));

    await waitFor(() => expect(screen.queryByTestId("voice-recording-bar")).toBeNull());
    expect(screen.queryByTestId("attach-preview")).toBeNull();
    expect(stream.tracks[0]!.stop).toHaveBeenCalledTimes(1);
    expect(signUploadApi).not.toHaveBeenCalled();
    expect(onSendMedia).not.toHaveBeenCalled();
    // Back to idle: the mic button is offered again.
    expect(micButton()).toBeEnabled();
  });

  it("a denied permission toasts and leaves the composer usable", async () => {
    const denied = new Error("nope");
    denied.name = "NotAllowedError";
    getUserMedia.mockRejectedValue(denied);
    renderComposer();

    fireEvent.click(micButton());

    expect(await screen.findByText("Can't record")).toBeInTheDocument();
    expect(screen.queryByTestId("voice-recording-bar")).toBeNull();
    // No crash, and attaching a file still works.
    expect(attachButton()).toBeEnabled();
  });

  it("recording and attaching are mutually exclusive in both directions", async () => {
    renderComposer();

    // While recording: the paperclip is disabled and the file funnel is inert.
    await startRecording();
    expect(attachButton()).toBeDisabled();
    fireEvent.change(fileInput(), {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });
    expect(screen.queryByTestId("attach-preview")).toBeNull();
    // Send is blocked too — stop or cancel first.
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
    await waitFor(() => expect(screen.queryByTestId("voice-recording-bar")).toBeNull());

    // With a file staged: the mic is disabled.
    fireEvent.change(fileInput(), {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });
    await screen.findByTestId("attach-preview");
    expect(micButton()).toBeDisabled();
    expect(getUserMedia).toHaveBeenCalledTimes(1); // no second mic grab
  });

  it("a staged voice note can be discarded without sending", async () => {
    const onSendMedia = renderComposer();
    await startRecording();
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await screen.findByTestId("attach-preview");

    fireEvent.click(screen.getByRole("button", { name: "Discard voice message" }));

    expect(screen.queryByTestId("attach-preview")).toBeNull();
    expect(signUploadApi).not.toHaveBeenCalled();
    expect(onSendMedia).not.toHaveBeenCalled();
    expect(micButton()).toBeEnabled();
  });

  it("a failed upload keeps the recording staged instead of forcing a re-record", async () => {
    signUploadApi.mockRejectedValueOnce(new Error("sign failed"));
    const onSendMedia = renderComposer();
    await startRecording();
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await screen.findByTestId("attach-preview");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // Same shared `pending` path as a picked file: the blob survives the failure,
    // so the user retries with Send rather than recording the whole note again.
    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
    const chip = await screen.findByTestId("attach-preview");
    expect(chip).toHaveAttribute("data-failed", "true");
    expect(chip).toHaveTextContent(/Voice message · \d+:\d{2}/);
    expect(screen.getByTestId("attach-failed")).toBeInTheDocument();
    expect(onSendMedia).not.toHaveBeenCalled();

    // Discarding still works in the failed state.
    fireEvent.click(screen.getByRole("button", { name: "Discard voice message" }));
    expect(screen.queryByTestId("attach-preview")).toBeNull();
  });

  it("unmounting mid-recording releases the mic", async () => {
    const { unmount } = render(
      <ToastProvider>
        <Composer members={members} onSend={vi.fn()} channelId="c1" onSendMedia={vi.fn()} />
      </ToastProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Record voice message" }));
    await screen.findByTestId("voice-recording-bar");

    unmount();

    expect(stream.tracks[0]!.stop).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances[0]!.state).toBe("inactive");
  });

  it("the 5-minute cap auto-stops and stages the recording rather than losing it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderComposer();
    // act-wrapped: start() awaits getUserMedia, so the "recording" state lands in
    // a microtask that RTL's fake-timer waitFor wouldn't flush inside act.
    await act(async () => {
      fireEvent.click(micButton());
    });
    expect(screen.getByTestId("voice-recording-bar")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });

    expect(screen.getByTestId("attach-preview")).toBeInTheDocument();
    expect(screen.getByTestId("attach-preview")).toHaveTextContent("Voice message · 5:00");
    expect(screen.queryByTestId("voice-recording-bar")).toBeNull();
    expect(stream.tracks[0]!.stop).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
