/**
 * Pane-wide file drop. ConversationView owns the drag listeners (dragenter/
 * dragover/dragleave/drop) and the "Drop file to attach" overlay; the actual
 * staging (validation, `pending`, mutual exclusion) stays inside Composer,
 * reached through the single `ComposerHandle.stageExternalFiles` ref method —
 * see Composer.drop.test.tsx for that half.
 *
 * Composer and MessageList are stubbed (same rationale as
 * ConversationView.keys.test.tsx: isolate the logic that actually lives in
 * ConversationView's own JSX). The stub Composer wires the same
 * forwardRef/useImperativeHandle shape as the real one so `stageExternalFiles`
 * calls can be asserted directly.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui";
import type { ChannelListItem } from "@/lib/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { stageExternalFiles } = vi.hoisted(() => ({ stageExternalFiles: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchPinned: vi.fn().mockResolvedValue([]),
  fetchMembers: vi.fn().mockResolvedValue([]),
  fetchChannelDetail: vi.fn().mockResolvedValue(null),
  fetchChannelLastSeen: vi.fn().mockResolvedValue({ lastSeen: null }),
}));

vi.mock("./MessageList", () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

vi.mock("./Composer", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    Composer: forwardRef((_props: unknown, ref: unknown) => {
      useImperativeHandle(ref as never, () => ({ stageExternalFiles }));
      return <div data-testid="stub-composer" />;
    }),
  };
});

import { ConversationView } from "./ConversationView";

function channel(): ChannelListItem {
  return {
    channelId: "chan-1",
    name: "Design",
    description: null,
    avatarUrl: null,
    type: "group",
    visibility: "private",
    isPriority: false,
    unreadCount: 0,
    lastActivityAt: new Date(0).toISOString(),
    members: [
      { id: "u1", displayName: "Alice", avatarUrl: null },
      { id: "u2", displayName: "Bob", avatarUrl: null },
    ],
    memberReadAt: {},
    memberDeliveredAt: {},
    lastMessage: null,
  } as ChannelListItem;
}

function Harness(): ReactNode {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConversationView
          channel={channel()}
          currentUserId="u1"
          messages={[]}
          loadingMessages={false}
          channels={undefined}
          onSend={vi.fn()}
          onSendMedia={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}

function pane(): HTMLElement {
  return document.querySelector(".qc-pane-convo") as HTMLElement;
}

/**
 * Minimal DataTransfer stand-in — jsdom doesn't implement the real thing.
 * Real browsers only populate `.files` at `drop`; during dragenter/dragover/
 * dragleave only `.types` is reliable, which is exactly what `isFileDrag`
 * checks — so the dragenter/leave helper below carries the "Files" type with
 * an empty `files` list, matching real browser behavior.
 */
function fileTransfer(files: File[]) {
  return { types: ["Files"], files };
}
function textTransfer() {
  return { types: ["text/plain"], files: [] };
}

beforeEach(() => {
  stageExternalFiles.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConversationView pane-wide drop zone", () => {
  it("forwards a dropped file to Composer.stageExternalFiles", () => {
    render(<Harness />);
    const file = new File(["bytes"], "a.png", { type: "image/png" });

    fireEvent.drop(pane(), { dataTransfer: fileTransfer([file]) });

    expect(stageExternalFiles).toHaveBeenCalledTimes(1);
    expect(Array.from(stageExternalFiles.mock.calls[0]![0] as File[])).toEqual([file]);
  });

  it("does not forward a drop carrying no files (a text-selection drag)", () => {
    render(<Harness />);

    fireEvent.drop(pane(), { dataTransfer: textTransfer() });

    expect(stageExternalFiles).not.toHaveBeenCalled();
  });

  it("shows the drop overlay while dragging a file over the pane, and clears it on leave", () => {
    render(<Harness />);

    fireEvent.dragEnter(pane(), { dataTransfer: fileTransfer([]) });
    expect(screen.getByText("Drop file to attach")).toBeInTheDocument();

    fireEvent.dragLeave(pane(), { dataTransfer: fileTransfer([]) });
    expect(screen.queryByText("Drop file to attach")).toBeNull();
  });

  it("clears the overlay once the file is dropped", () => {
    render(<Harness />);

    fireEvent.dragEnter(pane(), { dataTransfer: fileTransfer([]) });
    expect(screen.getByText("Drop file to attach")).toBeInTheDocument();

    fireEvent.drop(pane(), {
      dataTransfer: fileTransfer([new File(["x"], "a.png", { type: "image/png" })]),
    });
    expect(screen.queryByText("Drop file to attach")).toBeNull();
  });

  it("does not show the overlay for a drag carrying no files", () => {
    render(<Harness />);

    fireEvent.dragEnter(pane(), { dataTransfer: textTransfer() });

    expect(screen.queryByText("Drop file to attach")).toBeNull();
  });
});
