import type { MessageDto, PublicUser } from "@/lib/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageRow, type MessageRowActions } from "./MessageRow";

const members: PublicUser[] = [
  { id: "me", displayName: "Me", avatarUrl: null },
  { id: "u-alice", displayName: "Alice", avatarUrl: null },
];

function makeActions(over: Partial<MessageRowActions> = {}): MessageRowActions {
  return {
    meId: "me",
    members,
    onToggleReaction: vi.fn(),
    onReply: vi.fn(),
    onForward: vi.fn(),
    onTogglePin: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onJumpToParent: vi.fn(),
    ...over,
  };
}

const mk = (over: Partial<MessageDto> & { id: string }): MessageDto => ({
  channelId: "c1",
  senderId: "me",
  actorType: "human",
  type: "Text",
  content: "hi",
  data: null,
  parentMessageId: null,
  parentPreview: null,
  isPinned: false,
  reactions: [],
  mentions: [],
  // Fresh by default: the Edit action is gated on the QC_007 edit window, so a
  // hardcoded past date would hide Edit in every test. Nothing here asserts the
  // rendered timestamp. Tests that want a stale message pass `createdAt` explicitly.
  createdAt: new Date().toISOString(),
  editedAt: null,
  ...over,
});

/** ISO timestamp `minutes` in the past — for edit-window cases. */
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function renderRow(message: MessageDto, actions = makeActions(), currentUserId = "me") {
  return render(
    <MessageRow message={message} showAuthor currentUserId={currentUserId} actions={actions} />,
  );
}

describe("toolbar visibility rules", () => {
  it("shows Edit for own Text messages", () => {
    renderRow(mk({ id: "a", senderId: "me" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
  it("hides Edit for other users' messages", () => {
    renderRow(mk({ id: "a", senderId: "u-alice" }));
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
  });
  // QC_007 — the server rejects edits past EDIT_WINDOW_MS (15 min), so the action
  // must disappear rather than offer an edit that would 403.
  it("shows Edit for an own message still inside the edit window", () => {
    renderRow(mk({ id: "a", senderId: "me", createdAt: minutesAgo(14) }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
  it("hides Edit once the edit window has passed", () => {
    renderRow(mk({ id: "a", senderId: "me", createdAt: minutesAgo(16) }));
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    // The rest of the toolbar stays — the window gates Edit and nothing else.
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
  });
  it("renders no toolbar on Delete tombstones", () => {
    renderRow(mk({ id: "a", type: "Delete", content: "" }));
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.getByText("This message was deleted")).toBeInTheDocument();
  });
  it("renders a system row with no toolbar", () => {
    renderRow(mk({ id: "a", type: "SystemActivity", content: "Alice joined" }));
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.getByTestId("system-row")).toHaveTextContent("Alice joined");
  });
});

describe("reactions", () => {
  it("clicking a pill toggles the caller's reaction", () => {
    const actions = makeActions();
    renderRow(
      mk({ id: "a", reactions: [{ emoji: "👍", count: 1, userIds: ["u-alice"] }] }),
      actions,
    );
    fireEvent.click(screen.getByRole("button", { name: /Thumbs up from/ }));
    expect(actions.onToggleReaction).toHaveBeenCalledWith("a", "👍");
  });
  it("shows the reactor summary", () => {
    renderRow(mk({ id: "a", reactions: [{ emoji: "❤️", count: 2, userIds: ["me", "u-alice"] }] }));
    expect(screen.getByText("You and Alice")).toBeInTheDocument();
  });
});

describe("media attachments (Bug 3)", () => {
  const mediaMsg = (data: Record<string, unknown>) =>
    mk({ id: "m", type: "Media", content: "", data });

  it("a PDF opens the in-app preview (no direct download)", () => {
    const actions = makeActions({ onOpenMedia: vi.fn() });
    renderRow(
      mediaMsg({ mediaUrl: "/doc.pdf", mediaType: "application/pdf", originalName: "spec.pdf" }),
      actions,
    );
    const preview = screen.getByRole("button", { name: "Preview spec.pdf" });
    // It's a button (opens the lightbox), not an anchor that downloads.
    expect(preview.tagName).toBe("BUTTON");
    fireEvent.click(preview);
    expect(actions.onOpenMedia).toHaveBeenCalledWith({
      url: "/doc.pdf",
      mediaType: "application/pdf",
      originalName: "spec.pdf",
    });
  });

  it("a non-previewable file shows an explicit Download control", () => {
    renderRow(
      mediaMsg({
        mediaUrl: "/bundle.zip",
        mediaType: "application/zip",
        originalName: "bundle.zip",
      }),
    );
    const dl = screen.getByRole("link", { name: "Download bundle.zip" }) as HTMLAnchorElement;
    expect(dl.getAttribute("href")).toBe("/bundle.zip");
    expect(dl).toHaveAttribute("download");
    // The filename itself is not a navigating link (only the explicit control is).
    expect(screen.getByText("bundle.zip").closest("a")).toBeNull();
  });

  // Session 2: the audio branch renders the custom VoiceNotePlayer instead of a
  // native <audio controls>. Asserted through the player's public surface (its
  // testid + controls), not the hidden <audio> element's internals.
  it("an audio attachment renders the custom voice-note player", () => {
    renderRow(
      mediaMsg({
        mediaUrl: "/voice.webm",
        mediaType: "audio/webm",
        originalName: "voice-message-1.webm",
        objectPath: "quikchat/o/c/uuid-voice-message-1.webm",
        durationSec: 7,
      }),
    );

    expect(screen.getByTestId("voice-note-player")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play voice message" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek voice message" })).toBeInTheDocument();
    // The sender's recorded duration drives the readout.
    expect(screen.getByTestId("voice-note-time")).toHaveTextContent("0:00 / 0:07");
  });

  it("seeds the waveform from objectPath so a forward keeps the original's bars", () => {
    const shared = {
      mediaUrl: "/voice.webm",
      mediaType: "audio/webm",
      originalName: "voice-message-1.webm",
      objectPath: "quikchat/o/c/uuid-voice-message-1.webm",
      durationSec: 7,
    };
    const heights = () =>
      Array.from(
        screen.getByTestId("voice-note-wave").querySelectorAll(".qc-voice-note__bar"),
      ).map((b) => (b as HTMLElement).style.height);

    const first = renderRow(mediaMsg(shared));
    const original = heights();
    first.unmount();

    // A forward is a different message id with the SAME media object.
    renderRow(
      mk({
        id: "forwarded",
        type: "Media",
        content: "",
        data: {
          ...shared,
          forwardedFrom: { channelId: "c0", senderId: "u-alice", senderName: "Alice" },
        },
      }),
    );

    expect(heights()).toEqual(original);
  });
});

describe("Add to KB (Stage 3)", () => {
  const mediaMsg = mk({
    id: "m",
    type: "Media",
    content: "",
    data: {
      mediaUrl: "/doc.pdf",
      mediaType: "application/pdf",
      originalName: "spec.pdf",
      objectPath: "quikchat/o/c/uuid-spec.pdf",
    },
  });

  it("does not render the affordance without onAddToKb (normal channel / plain turn)", () => {
    renderRow(mediaMsg, makeActions());
    expect(screen.queryByTestId("add-to-kb")).toBeNull();
  });

  it("does not render on a non-Media message even when onAddToKb is provided", () => {
    renderRow(mk({ id: "a", content: "hi" }), makeActions({ onAddToKb: vi.fn() }));
    expect(screen.queryByTestId("add-to-kb")).toBeNull();
  });

  it("ingests with the chosen visibility and confirms the indexed section count", async () => {
    const onAddToKb = vi.fn(async () => ({
      sourceFileId: "quikchat/o/c/uuid-spec.pdf",
      chunksStored: 42,
      contentHash: "h",
    }));
    renderRow(mediaMsg, makeActions({ onAddToKb }));
    // Open the popover, then pick "Share with org" (the menu is portaled to
    // document.body, so reach it via the async document-level findByRole).
    fireEvent.click(screen.getByRole("button", { name: /add to knowledge base/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /share with org/i }));
    expect(onAddToKb).toHaveBeenCalledWith(mediaMsg, "ORG");
    await waitFor(() =>
      expect(screen.getByTestId("add-to-kb")).toHaveTextContent(/42 sections/),
    );
  });
});

describe("in-place edit", () => {
  it("opens a textarea, recomputes mentions and calls onEdit", () => {
    const actions = makeActions();
    renderRow(mk({ id: "a", content: "hi" }), actions);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const area = screen.getByLabelText("Edit message");
    fireEvent.change(area, { target: { value: "hello @Alice" } });
    fireEvent.keyDown(area, { key: "Enter" });
    expect(actions.onEdit).toHaveBeenCalledWith("a", "hello @Alice", [
      { userId: "u-alice", offsetStart: 6, offsetEnd: 12 },
    ]);
  });
  it("guards an unchanged edit (no onEdit)", () => {
    const actions = makeActions();
    renderRow(mk({ id: "a", content: "same" }), actions);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const area = screen.getByLabelText("Edit message");
    fireEvent.keyDown(area, { key: "Enter" });
    expect(actions.onEdit).not.toHaveBeenCalled();
  });
});

describe("delete", () => {
  it("calls onDelete from the more menu", () => {
    const actions = makeActions();
    renderRow(mk({ id: "a", senderId: "me" }), actions);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(actions.onDelete).toHaveBeenCalledWith("a");
  });
});

describe("parentPreview + forwarded", () => {
  it("renders a text quote", () => {
    renderRow(
      mk({
        id: "a",
        parentPreview: { id: "p", senderId: "u-alice", type: "Text", content: "original" },
      }),
    );
    expect(screen.getByTestId("parent-quote")).toHaveTextContent("original");
  });
  it("renders a deleted-parent quote", () => {
    renderRow(
      mk({
        id: "a",
        parentPreview: { id: "p", senderId: "u-alice", type: "Delete", content: "" },
      }),
    );
    expect(screen.getByTestId("parent-quote")).toHaveTextContent("This message was deleted");
  });
  it("renders a forwarded-from label", () => {
    renderRow(
      mk({
        id: "a",
        content: "fwd",
        data: { forwardedFrom: { channelId: "c0", senderId: "u-alice", senderName: "Alice" } },
      }),
    );
    expect(screen.getByText("Forwarded from Alice")).toBeInTheDocument();
  });
});
