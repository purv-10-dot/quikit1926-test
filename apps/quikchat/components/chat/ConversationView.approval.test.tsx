// @vitest-environment jsdom
/**
 * The ephemeral live-turn card and the persisted approval message, in one pane.
 *
 * BOTH are meant to exist — the ephemeral one appears the instant the
 * `approval_needed` frame arrives, with no server round trip, and the persisted
 * one is what survives a reload, a channel switch and a second device. Removing
 * either is a separate piece of work.
 *
 * What must never happen is BOTH rendering at once: the same request twice, one
 * above the composer and one in the transcript, each with its own Approve
 * button. So they hand over. These tests pin the handover, because it is the
 * part that silently regresses the moment either side is touched — nothing else
 * in the suite would notice two cards.
 *
 * `MessageList` is NOT mocked here (unlike the sibling suites) precisely because
 * the persisted card renders through it. Mocking it would make the double-render
 * this file exists to catch structurally impossible to observe.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui";
import type { AssistApprovalRequest, ChannelListItem, MessageDto } from "@/lib/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchPinned: vi.fn().mockResolvedValue([]),
  fetchMembers: vi.fn().mockResolvedValue([]),
  fetchChannelDetail: vi.fn().mockResolvedValue(null),
  fetchChannelLastSeen: vi.fn().mockResolvedValue({ lastSeen: null }),
  reconcileChannelApprovals: vi.fn().mockResolvedValue({
    checked: 0,
    patched: 0,
    unconfirmed: 0,
    ledgerComplete: true,
  }),
}));

import { reconcileChannelApprovals } from "@/lib/api";
import { ConversationView } from "./ConversationView";

const ME = "u-me";
const REQ = "req-live";

const liveRequest: AssistApprovalRequest = {
  requestId: REQ,
  appId: "quiktrack",
  toolName: "create_issue",
  riskClass: "soft_write",
  summary: "Create a QuikTrack issue titled “Login fails on Safari”.",
  toolInput: { projectId: "QTRK" },
  expiresAt: "2099-01-01T00:00:00.000Z",
};

function approvalMessage(over: Record<string, unknown> = {}): MessageDto {
  return {
    id: "m-approval",
    channelId: "chan-1",
    senderId: "quikchat-assistant-bot",
    actorType: "ai_agent",
    type: "ApprovalRequest",
    content: liveRequest.summary,
    data: {
      requestId: REQ,
      requesterId: ME,
      appId: "quiktrack",
      toolName: "create_issue",
      summary: liveRequest.summary,
      toolInput: { projectId: "QTRK" },
      riskClass: "soft_write",
      expiresAt: "2099-01-01T00:00:00.000Z",
      proposedAt: "2026-08-20T12:00:00.000Z",
      status: "pending",
      ...over,
    },
    parentMessageId: null,
    parentPreview: null,
    isPinned: false,
    reactions: [],
    mentions: [],
    clientMessageId: `approval-${REQ}`,
    createdAt: "2026-08-20T12:00:00.000Z",
    editedAt: null,
  };
}

function channel(): ChannelListItem {
  return {
    channelId: "chan-1",
    name: "AI Chat",
    description: null,
    avatarUrl: null,
    type: "ai",
    visibility: "private",
    isPriority: false,
    unreadCount: 0,
    lastActivityAt: new Date(0).toISOString(),
    members: [{ id: ME, displayName: "Me", avatarUrl: null }],
    memberReadAt: {},
    memberDeliveredAt: {},
    lastMessage: null,
  } as ChannelListItem;
}

function Harness({
  messages,
  assistApproval,
  currentUserId = ME,
}: {
  messages: MessageDto[];
  assistApproval?: AssistApprovalRequest | null;
  currentUserId?: string;
}): ReactNode {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConversationView
          channel={channel()}
          currentUserId={currentUserId}
          messages={messages}
          loadingMessages={false}
          channels={undefined}
          onSend={vi.fn()}
          assistApproval={assistApproval ?? null}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(reconcileChannelApprovals).mockClear();
});

describe("live card ↔ persisted card handover", () => {
  it("shows the ephemeral card while the persisted one has not arrived", () => {
    render(<Harness messages={[]} assistApproval={liveRequest} />);
    expect(screen.getByTestId("assist-approval")).toBeTruthy();
    expect(screen.getAllByTestId("approval-card")).toHaveLength(1);
  });

  it("stands the ephemeral card down once the persisted message lands", () => {
    render(<Harness messages={[approvalMessage()]} assistApproval={liveRequest} />);
    // Exactly one card for one request — the whole point.
    expect(screen.getAllByTestId("approval-card")).toHaveLength(1);
    expect(screen.queryByTestId("assist-approval")).toBeNull();
  });

  it("the surviving card is the persisted one, still actionable by the requester", () => {
    render(<Harness messages={[approvalMessage()]} assistApproval={liveRequest} />);
    const card = screen.getByTestId("approval-card");
    expect(card.getAttribute("data-request-id")).toBe(REQ);
    expect(screen.getByTestId("approval-approve")).toBeTruthy();
  });

  it("an unrelated older card does NOT suppress a live one", () => {
    // Matching on requestId rather than on "an approval card exists" — otherwise
    // one historical card in the channel would hide every future live turn.
    const older = { ...approvalMessage(), id: "m-old" };
    (older.data as Record<string, unknown>).requestId = "req-other";
    older.clientMessageId = "approval-req-other";
    render(<Harness messages={[older]} assistApproval={liveRequest} />);
    expect(screen.getByTestId("assist-approval")).toBeTruthy();
    expect(screen.getAllByTestId("approval-card")).toHaveLength(2);
  });

  it("renders the persisted card with no live turn at all — reload, or a second device", () => {
    render(<Harness messages={[approvalMessage()]} assistApproval={null} />);
    expect(screen.getAllByTestId("approval-card")).toHaveLength(1);
    expect(screen.queryByTestId("assist-approval")).toBeNull();
  });
});

describe("the persisted card in a shared channel", () => {
  it("gives an observer the outcome but no buttons and no arguments", () => {
    render(<Harness messages={[approvalMessage()]} assistApproval={null} currentUserId="u-other" />);
    expect(screen.getByText("Only the person who asked can answer this.")).toBeTruthy();
    expect(screen.queryByTestId("approval-approve")).toBeNull();
    expect(screen.queryByTestId("approval-tool-input")).toBeNull();
  });

  it("shows an observer what happened once it is decided", () => {
    render(
      <Harness
        messages={[
          approvalMessage({ status: "executed", outcomeSummary: "Created QUIKSC-290." }),
        ]}
        assistApproval={null}
        currentUserId="u-other"
      />,
    );
    expect(screen.getByTestId("approval-terminal").textContent).toContain("Created QUIKSC-290");
  });
});

describe("the reconcile trigger", () => {
  it("runs when one of MY cards is still pending here", () => {
    render(<Harness messages={[approvalMessage()]} assistApproval={null} />);
    expect(reconcileChannelApprovals).toHaveBeenCalledWith("chan-1");
  });

  it("does not run for a channel with no approval cards", () => {
    // Opening an ordinary channel must not cost a runtime round trip.
    render(<Harness messages={[]} assistApproval={null} />);
    expect(reconcileChannelApprovals).not.toHaveBeenCalled();
  });

  it("does not run for someone else's card — we could not read its row anyway", () => {
    render(<Harness messages={[approvalMessage()]} assistApproval={null} currentUserId="u-other" />);
    expect(reconcileChannelApprovals).not.toHaveBeenCalled();
  });

  it("does not run for a card that is already decided", () => {
    render(
      <Harness
        messages={[approvalMessage({ status: "executed", outcomeSummary: "Created." })]}
        assistApproval={null}
      />,
    );
    expect(reconcileChannelApprovals).not.toHaveBeenCalled();
  });
});
