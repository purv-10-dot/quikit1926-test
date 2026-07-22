// TODO(e2e, WYSIWYG Stage 3): the following Composer behaviors moved to
// Playwright e2e in Stage 1b-iii — they drive text/selection into TipTap's
// contenteditable, which can't run in jsdom (fireEvent.change throws: a
// <div contenteditable> has no value setter). Cover each in the e2e suite:
//   1.  Enter sends the message and clears the editor
//   2.  Shift+Enter inserts a hard break (does NOT send)
//   3.  empty / whitespace-only input does not send
//   4.  a typed @Name produces the right mention offsets in sent content
//   5.  typing notifies onTyping (debounced once/window) and re-arms after send
//   6.  whitespace-only input does not notify typing
//   7.  emoji picker inserts the chosen emoji at the caret
//   8.  toolbar Bold/Italic/Code wrap the current selection (TipTap marks)
//   9.  a plain message still sends on Enter when formatting is active
//   10. `/ai` (and `/ask`) routes to onAssist, not onSend
//   11. a normal message routes to onSend, not onAssist
//   12. a caption typed alongside an attachment travels with the media on send
//   13. paste strips rich formatting → plain text, newlines become hard breaks
import { ToastProvider } from "@/components/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { Composer } from "./Composer";

const members = [{ id: "u1", displayName: "Alice" }];

function renderComposer(onSendMedia = vi.fn()) {
  render(
    <ToastProvider>
      <Composer members={members} onSend={vi.fn()} channelId="c1" onSendMedia={onSendMedia} />
    </ToastProvider>,
  );
  return onSendMedia;
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

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
  vi.restoreAllMocks();
});

describe("Composer attach flow (stage → preview → send)", () => {
  it("picking a file stages a preview and does NOT upload or send yet", async () => {
    const onSendMedia = renderComposer();
    const file = new File(["bytes"], "a.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    // Preview chip appears…
    expect(await screen.findByTestId("attach-preview")).toBeInTheDocument();
    expect(screen.getByText("a.png")).toBeInTheDocument();
    // …but nothing is uploaded or posted until the user hits Send.
    expect(signUploadApi).not.toHaveBeenCalled();
    expect(onSendMedia).not.toHaveBeenCalled();
  });

  it("clicking Send uploads the staged file and posts it", async () => {
    const onSendMedia = renderComposer();
    const file = new File(["bytes"], "a.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await screen.findByTestId("attach-preview");

    // Note: typing a caption into the editor is exercised in the Stage 3 e2e
    // suite (see the TODO(e2e) header) — it can't run against TipTap in jsdom.
    // Here we send with an empty editor, so the caption serializes to "".
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(signUploadApi).toHaveBeenCalled());
    await waitFor(() => expect(onSendMedia).toHaveBeenCalled());
    const [meta, caption, localUrl] = onSendMedia.mock.calls[0]!;
    expect(meta).toMatchObject({ objectPath: "quikchat/o/c/uuid-a.png", mediaType: "image/png" });
    expect(caption).toBe("");
    expect(localUrl).toBe("blob:preview");
    // Chip cleared after send.
    await waitFor(() => expect(screen.queryByTestId("attach-preview")).toBeNull());
  });

  it("removing the staged attachment clears it without sending", async () => {
    const onSendMedia = renderComposer();
    const file = new File(["bytes"], "a.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await screen.findByTestId("attach-preview");

    fireEvent.click(screen.getByRole("button", { name: "Remove attachment" }));
    expect(screen.queryByTestId("attach-preview")).toBeNull();
    expect(signUploadApi).not.toHaveBeenCalled();
    expect(onSendMedia).not.toHaveBeenCalled();
  });

  it("rejects a disallowed type with a toast and no staging", async () => {
    const onSendMedia = renderComposer();
    const file = new File(["x"], "a.exe", { type: "application/x-msdownload" });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    expect(await screen.findByText("Can't attach that")).toBeInTheDocument();
    expect(screen.queryByTestId("attach-preview")).toBeNull();
    expect(signUploadApi).not.toHaveBeenCalled();
    expect(onSendMedia).not.toHaveBeenCalled();
  });

  it("toasts on upload failure when sending", async () => {
    signUploadApi.mockRejectedValueOnce(new Error("sign failed"));
    const onSendMedia = renderComposer();
    const file = new File(["bytes"], "a.png", { type: "image/png" });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await screen.findByTestId("attach-preview");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
    expect(onSendMedia).not.toHaveBeenCalled();
  });
});
