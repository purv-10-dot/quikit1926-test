/**
 * Sibling key uniqueness in ConversationView.
 *
 * MessageList and Composer are unrelated siblings under the same
 * `<section className="qc-pane-convo">`, and React's key-uniqueness applies
 * across ALL children of one parent regardless of component type — so two
 * different components sharing the bare `channelId` is "Encountered two children
 * with the same key". Both keys must stay DISTINCT (no warning) and remain
 * CHANNEL-SCOPED (each still remounts on a channel switch, which is what keeps
 * TipTap's placeholder and MessageList's scroll state from freezing).
 *
 * MessageList and Composer are stubbed. The keys under test live in
 * ConversationView's own JSX, so stubbing cannot mask a regression there — it
 * only keeps TipTap out of jsdom and lets the stubs count their own mounts.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui";
import type { ChannelListItem } from "@/lib/shared";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mounts } = vi.hoisted(() => ({ mounts: [] as string[] }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  fetchPinned: vi.fn().mockResolvedValue([]),
  fetchMembers: vi.fn().mockResolvedValue([]),
  fetchChannelDetail: vi.fn().mockResolvedValue(null),
  fetchChannelLastSeen: vi.fn().mockResolvedValue({ lastSeen: null }),
}));

vi.mock("./MessageList", async () => {
  const { useEffect } = await import("react");
  return {
    MessageList: () => {
      useEffect(() => {
        mounts.push("MessageList");
      }, []);
      return <div data-testid="stub-messagelist" />;
    },
  };
});

vi.mock("./Composer", async () => {
  const { useEffect } = await import("react");
  return {
    Composer: () => {
      useEffect(() => {
        mounts.push("Composer");
      }, []);
      return <div data-testid="stub-composer" />;
    },
  };
});

import { ConversationView } from "./ConversationView";

function channel(channelId: string): ChannelListItem {
  return {
    channelId,
    name: "Design",
    description: null,
    avatarUrl: null,
    // A group, so the DM last-seen query stays disabled.
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

let errorSpy: ReturnType<typeof vi.spyOn>;

/** console.error calls that are React's duplicate-sibling-key warning. */
function duplicateKeyWarnings(): string[] {
  return errorSpy.mock.calls
    .filter((call) => call.some((a) => String(a).includes("two children with the same key")))
    // Interpolate the `%s` key arg so a failure names the offending key.
    .map((call) => call.map((a) => String(a)).join(" | "));
}

function Harness({ cid, loading }: { cid: string; loading: boolean }): ReactNode {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConversationView
          channel={channel(cid)}
          currentUserId="u1"
          messages={loading ? undefined : []}
          loadingMessages={loading}
          channels={undefined}
          onSend={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mounts.length = 0;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("ConversationView sibling keys", () => {
  it("renders MessageList and Composer without a duplicate-key warning", () => {
    render(<Harness cid="chan-1" loading={false} />);
    expect(duplicateKeyWarnings()).toEqual([]);
  });

  it("keeps both keys channel-scoped — a channel switch remounts each exactly once", () => {
    const { rerender } = render(<Harness cid="chan-1" loading={false} />);
    expect(mounts).toEqual(["MessageList", "Composer"]);

    // Same channel → no churn: neither key changed, so neither remounts.
    rerender(<Harness cid="chan-1" loading={false} />);
    expect(mounts).toEqual(["MessageList", "Composer"]);

    // Different channel → both keys change, so both remount (the documented
    // reason the keys exist at all).
    rerender(<Harness cid="chan-2" loading={false} />);
    expect(mounts).toEqual(["MessageList", "Composer", "MessageList", "Composer"]);
    expect(duplicateKeyWarnings()).toEqual([]);
  });

  it("does not remount the Composer when messages finish loading", () => {
    // The spinner and MessageList share one slot, so this transition is where
    // React falls back to key-map matching for the remaining siblings — a
    // colliding key can pair the wrong element with the wrong fiber here.
    const { rerender } = render(<Harness cid="chan-1" loading={true} />);
    expect(mounts).toEqual(["Composer"]); // spinner in MessageList's slot

    rerender(<Harness cid="chan-1" loading={false} />);

    expect(mounts).toEqual(["Composer", "MessageList"]);
    expect(duplicateKeyWarnings()).toEqual([]);
  });
});
