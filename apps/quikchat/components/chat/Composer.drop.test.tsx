// @vitest-environment jsdom
/**
 * `Composer.stageExternalFiles` — the one imperative entry point ConversationView's
 * pane-wide drop zone is allowed to call. It must funnel through the exact same
 * `stageFile` staging path the paperclip uses (same `pending` shape, same preview,
 * same validation), and respect every mutual-exclusion guard the paperclip/mic
 * buttons normally encode via `disabled` — a drop has no disabled affordance to
 * lean on, so the guard has to live in the handler itself.
 *
 * These tests call the ref directly rather than simulating a real DragEvent: jsdom's
 * DragEvent/DataTransfer support is unreliable, and the actual drag-listener wiring
 * (dragenter/dragover/dragleave/drop, the overlay) lives in ConversationView, not
 * here — see ConversationView.drop.test.tsx for that half.
 */
import { ToastProvider } from "@/components/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
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

import { Composer, type ComposerHandle } from "./Composer";

const members = [{ id: "u1", displayName: "Alice" }];

function renderComposer(onSendMedia = vi.fn()) {
  const ref = createRef<ComposerHandle>();
  render(
    <ToastProvider>
      <Composer
        ref={ref}
        members={members}
        onSend={vi.fn()}
        currentUserId="u1"
        channelId="c1"
        onSendMedia={onSendMedia}
      />
    </ToastProvider>,
  );
  return { ref, onSendMedia };
}

const png = (name = "a.png") => new File(["bytes"], name, { type: "image/png" });

beforeEach(() => {
  signUploadApi.mockReset();
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:preview";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
  signUploadApi.mockResolvedValue({
    uploadUrl: "/api/uploads/local/tok",
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    objectPath: "quikchat/o/c/uuid-a.png",
    maxBytes: 1024,
    expiresAt: new Date().toISOString(),
  });
});
afterEach(() => {
  delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  vi.restoreAllMocks();
});

describe("Composer.stageExternalFiles (pane-wide drop entry point)", () => {
  it("stages a single dropped file exactly like the paperclip preview", () => {
    const { ref } = renderComposer();
    act(() => ref.current!.stageExternalFiles([png()]));

    const chip = screen.getByTestId("attach-preview");
    expect(chip).toBeInTheDocument();
    expect(screen.getByText("a.png")).toBeInTheDocument();
    expect(signUploadApi).not.toHaveBeenCalled();
  });

  it("rejects an invalid type with the same message the paperclip path uses", () => {
    const { ref } = renderComposer();
    const bad = new File(["x"], "a.exe", { type: "application/x-msdownload" });
    act(() => ref.current!.stageExternalFiles([bad]));

    expect(screen.getByText("Can't attach that")).toBeInTheDocument();
    expect(screen.getByText("That file type isn't supported.")).toBeInTheDocument();
    expect(screen.queryByTestId("attach-preview")).toBeNull();
  });

  it("rejects multiple files with no partial staging", () => {
    const { ref } = renderComposer();
    act(() => ref.current!.stageExternalFiles([png("a.png"), png("b.png")]));

    expect(screen.getByText("Can't attach that")).toBeInTheDocument();
    expect(screen.getByText("Drop one file at a time.")).toBeInTheDocument();
    expect(screen.queryByTestId("attach-preview")).toBeNull();
  });

  it("is a no-op when something is already staged", () => {
    const { ref } = renderComposer();
    act(() => ref.current!.stageExternalFiles([png("a.png")]));
    expect(screen.getByText("a.png")).toBeInTheDocument();

    act(() => ref.current!.stageExternalFiles([png("b.png")]));

    // Still the first file — the second drop was silently ignored, not queued.
    expect(screen.getByText("a.png")).toBeInTheDocument();
    expect(screen.queryByText("b.png")).toBeNull();
    expect(screen.getAllByTestId("attach-preview")).toHaveLength(1);
  });

  it("is a no-op while an upload is in flight", async () => {
    let resolveSign!: (v: unknown) => void;
    signUploadApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSign = resolve;
        }),
    );
    const { ref, onSendMedia } = renderComposer();
    act(() => ref.current!.stageExternalFiles([png("a.png")]));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());

    act(() => ref.current!.stageExternalFiles([png("b.png")]));

    expect(screen.getByText("a.png")).toBeInTheDocument();
    expect(screen.queryByText("b.png")).toBeNull();

    // Let the in-flight upload settle so it doesn't dangle past the test.
    resolveSign({
      uploadUrl: "/api/uploads/local/tok",
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      objectPath: "quikchat/o/c/uuid-a.png",
      maxBytes: 1024,
      expiresAt: new Date().toISOString(),
    });
    await waitFor(() => expect(onSendMedia).toHaveBeenCalled());
  });

  it("is a no-op while recording", async () => {
    const stream = new FakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
      writable: true,
    });
    const { ref } = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "Record voice message" }));
    await screen.findByTestId("voice-recording-bar");

    act(() => ref.current!.stageExternalFiles([png()]));

    expect(screen.queryByTestId("attach-preview")).toBeNull();
    expect(screen.getByTestId("voice-recording-bar")).toBeInTheDocument();
  });
});
