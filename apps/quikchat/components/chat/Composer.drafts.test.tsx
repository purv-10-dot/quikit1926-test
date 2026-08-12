// @vitest-environment jsdom
/**
 * Per-channel composer draft persistence. Switching channels remounts
 * <Composer> (TipTap builds its editor once per mount), which used to destroy
 * any half-typed text with it. These pin down the fix:
 *   - a draft survives switching away and back (unmount-time save)
 *   - a draft survives a hard reload before any unmount fires (debounced
 *     save-as-you-type backstop)
 *   - drafts are isolated per channel
 *   - sending — normal, and the `/ai` assist path — clears the draft
 *   - empty/whitespace-only content is never persisted
 *   - restoring a draft does not fire onTyping (no read/typing side effect)
 *   - a corrupted stored entry can't crash the mount
 *
 * Text goes into TipTap via a paste event (ProseMirror's own `handlePaste`
 * dispatch), not `fireEvent.change` — a contenteditable div has no `.value`
 * setter, so `.change` throws here (see the TODO(e2e) header in
 * Composer.media.test.tsx). Paste is a real DOM event ProseMirror listens for
 * natively, so it drives real content into the doc without extra mocking.
 */
import { ToastProvider } from "@/components/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";
import { getDraft, saveDraft } from "@/lib/composer-drafts";

const signUploadApi = vi.fn();
vi.mock("@/lib/api", () => ({ signUploadApi: (...a: unknown[]) => signUploadApi(...a) }));

// Minimal fake XHR so the one attachment-send test can complete the upload —
// mirrors Composer.media.test.tsx's fixture.
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

const members = [{ id: "u2", displayName: "Bob" }];
const USER = "u1";

function renderComposer(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn();
  const onTyping = vi.fn();
  const utils = render(
    <ToastProvider>
      <Composer
        members={members}
        onSend={onSend}
        onTyping={onTyping}
        currentUserId={USER}
        channelId="c1"
        onSendMedia={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  );
  return { ...utils, onSend, onTyping };
}

const editorEl = () => document.querySelector(".qc-composer__editor") as HTMLElement;
const editorText = () => editorEl()?.textContent ?? "";

/** Drive plain text into the editor via a real paste event. */
function pasteText(text: string) {
  fireEvent.paste(editorEl(), {
    clipboardData: { getData: () => text, files: [] },
  });
}

beforeEach(() => {
  localStorage.clear();
  signUploadApi.mockReset();
  signUploadApi.mockResolvedValue({
    uploadUrl: "/api/uploads/local/tok",
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    objectPath: "quikchat/o/c/uuid-a.png",
    maxBytes: 1024,
    expiresAt: new Date().toISOString(),
  });
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:x";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Composer draft persistence", () => {
  it("a draft survives unmount and is restored on remount of the same channel", async () => {
    const { unmount } = renderComposer();
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    pasteText("half-typed thought");
    await waitFor(() => expect(editorText()).toContain("half-typed thought"));

    unmount();
    renderComposer();

    await waitFor(() => expect(editorText()).toContain("half-typed thought"));
  });

  it("drafts are isolated per channel", async () => {
    const { unmount } = renderComposer({ channelId: "c1" });
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    pasteText("only for c1");
    await waitFor(() => expect(editorText()).toContain("only for c1"));
    unmount();

    renderComposer({ channelId: "c2" });
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    expect(editorText()).not.toContain("only for c1");
  });

  it("sending clears the draft — remounting the same channel is empty", async () => {
    const { onSend, unmount } = renderComposer();
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    pasteText("ready to send");
    await waitFor(() => expect(editorText()).toContain("ready to send"));

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledTimes(1);
    unmount();

    renderComposer();
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    expect(editorText()).toBe("");
    expect(getDraft(USER, "c1")).toBeNull();
  });

  it("the /ai assist path clears the draft too", async () => {
    const onAssist = vi.fn();
    const { unmount } = renderComposer({ onAssist });
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    pasteText("/ai summarize this");
    await waitFor(() => expect(editorText()).toContain("/ai summarize this"));

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onAssist).toHaveBeenCalledWith("summarize this");
    unmount();

    expect(getDraft(USER, "c1")).toBeNull();
  });

  it("sending a staged attachment clears the caption draft too", async () => {
    const onSendMedia = vi.fn();
    const { unmount } = renderComposer({ onSendMedia });
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    pasteText("a caption");
    await waitFor(() => expect(editorText()).toContain("a caption"));

    const file = new File(["bytes"], "a.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByTestId("attach-preview");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSendMedia).toHaveBeenCalled());
    unmount();

    expect(getDraft(USER, "c1")).toBeNull();
  });

  it("whitespace-only content is never persisted", async () => {
    const { unmount } = renderComposer();
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    pasteText("   ");
    await waitFor(() => expect(editorText()).toContain(" "));

    unmount();

    expect(getDraft(USER, "c1")).toBeNull();
  });

  it("restoring a draft does not fire onTyping", async () => {
    saveDraft(USER, "c1", {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "already here" }] }],
    });
    const { onTyping } = renderComposer();

    await waitFor(() => expect(editorText()).toContain("already here"));
    expect(onTyping).not.toHaveBeenCalled();
  });

  it("a hard reload before any unmount still sees the debounced draft", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderComposer();
    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    pasteText("typed just now");
    await waitFor(() => expect(editorText()).toContain("typed just now"));

    // No unmount — simulates a tab reload while the debounce window is open.
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(getDraft(USER, "c1")).not.toBeNull();
  });

  it("a corrupted stored draft does not crash the mount, and self-heals", async () => {
    localStorage.setItem("qc.draft.v1.u1.c1", "not json");

    renderComposer();

    await waitFor(() => expect(editorEl()).toBeInTheDocument());
    expect(editorText()).toBe("");
    expect(localStorage.getItem("qc.draft.v1.u1.c1")).toBeNull();
  });
});
