import type { NotificationDto } from "@/lib/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- mock the API client the provider seeds/reconciles against, plus the
// module's own channel/message calls (fetchChannels/fetchMessages/etc.) ---
const api = {
  fetchNotifications: vi.fn(),
  fetchUnreadByChannel: vi.fn(),
  fetchUnreadCount: vi.fn(),
  markNotificationsReadApi: vi.fn(),
  markAllNotificationsReadApi: vi.fn(),
  markChannelNotificationsReadApi: vi.fn(),
  clearNotificationsApi: vi.fn(),
  fetchChannels: vi.fn(),
  fetchMessages: vi.fn(),
  markChannelReadApi: vi.fn(),
  sendMessage: vi.fn(),
  // The "Your approvals" section mounts inside this module. This factory
  // replaces the whole `@/lib/api` module, so an unlisted key is `undefined` and
  // the section's query would throw rather than render — the section self-hides
  // on an empty page, which is what these notification tests want.
  fetchApprovals: vi.fn(),
  decideApproval: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  fetchNotifications: (...a: unknown[]) => api.fetchNotifications(...a),
  fetchUnreadByChannel: (...a: unknown[]) => api.fetchUnreadByChannel(...a),
  fetchUnreadCount: (...a: unknown[]) => api.fetchUnreadCount(...a),
  markNotificationsReadApi: (...a: unknown[]) => api.markNotificationsReadApi(...a),
  markAllNotificationsReadApi: (...a: unknown[]) => api.markAllNotificationsReadApi(...a),
  markChannelNotificationsReadApi: (...a: unknown[]) => api.markChannelNotificationsReadApi(...a),
  clearNotificationsApi: (...a: unknown[]) => api.clearNotificationsApi(...a),
  fetchChannels: (...a: unknown[]) => api.fetchChannels(...a),
  fetchMessages: (...a: unknown[]) => api.fetchMessages(...a),
  markChannelReadApi: (...a: unknown[]) => api.markChannelReadApi(...a),
  sendMessage: (...a: unknown[]) => api.sendMessage(...a),
  fetchApprovals: (...a: unknown[]) => api.fetchApprovals(...a),
  decideApproval: (...a: unknown[]) => api.decideApproval(...a),
  // Not a function, so it needs declaring here too — Vitest throws on any
  // access to an export the factory omitted, and the section reads this one at
  // render time to key its query.
  APPROVALS_QUERY_KEY: ["ai-approvals"],
}));

vi.mock("@/lib/web-notifications", () => ({
  notificationsSupported: () => true,
  permissionState: () => "granted",
  isAppFocused: () => true,
  requestPermission: vi.fn(async () => "granted"),
  fireOsNotification: vi.fn(),
  shouldFireOsNotification: () => false,
}));

vi.mock("@/lib/notification-sound", () => ({
  playNotificationSound: vi.fn(),
  notificationSoundSupported: () => true,
}));

import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { NotificationsModule } from "./NotificationsModule";

function dto(over: Partial<NotificationDto> & { meta?: Record<string, unknown> }): NotificationDto {
  return {
    id: "x",
    type: "mention",
    actorId: "a1",
    channelId: "c1",
    messageId: "m1",
    preview: "preview",
    meta: { channelName: "design", channelType: "group", actorName: "Maya" },
    isRead: false,
    createdAt: new Date().toISOString(),
    ...over,
  } as NotificationDto;
}

const SEED: NotificationDto[] = [
  dto({ id: "1", preview: "review the flow" }),
  dto({
    id: "2",
    type: "keyword",
    meta: { channelName: "design", channelType: "group", actorName: "Arjun", keyword: "deploy" },
    preview: "pushing deploy",
  }),
];

function renderModule() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <NotificationProvider>
          <NotificationsModule currentUserId="u1" />
        </NotificationProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

// The row's preview text node is "<summary> — <preview>" as one combined
// string, so lookups match a substring rather than the preview verbatim.
function findPreview(preview: string) {
  return screen.getByText((content) => content.includes(preview));
}

function queryPreview(preview: string) {
  return screen.queryByText((content) => content.includes(preview));
}

function rowFor(preview: string) {
  return findPreview(preview).closest(".qc-act-row") as HTMLElement;
}

async function openRowMenu(preview: string) {
  const row = rowFor(preview);
  fireEvent.click(within(row).getByLabelText("More actions"));
  return row;
}

beforeEach(() => {
  api.fetchChannels.mockResolvedValue({ priority: [], recent: [] });
  api.fetchMessages.mockResolvedValue([]);
  api.markChannelReadApi.mockResolvedValue(undefined);
  api.sendMessage.mockResolvedValue(undefined);
  api.fetchNotifications.mockResolvedValue({ items: SEED, unreadCount: 2 });
  api.fetchUnreadByChannel.mockResolvedValue({ byChannel: { c1: 2 }, total: 2 });
  api.fetchUnreadCount.mockResolvedValue({ count: 2 });
  api.markNotificationsReadApi.mockResolvedValue({ unreadCount: 1 });
  api.markAllNotificationsReadApi.mockResolvedValue({ unreadCount: 0 });
  api.markChannelNotificationsReadApi.mockResolvedValue({ affected: 2, unreadCount: 0 });
  api.clearNotificationsApi.mockResolvedValue({ unreadCount: 0 });
  // No parked writes in these fixtures — the section self-hides, so the
  // notification assertions below see the pane they were written against.
  api.fetchApprovals.mockResolvedValue({ requests: [], total: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Mark all read", () => {
  it("calls markAllRead and flips every row to read", async () => {
    renderModule();
    await waitFor(() => expect(queryPreview("review the flow")).not.toBeNull());
    expect(rowFor("review the flow")).toHaveAttribute("data-unread", "true");
    expect(rowFor("pushing deploy")).toHaveAttribute("data-unread", "true");

    fireEvent.click(screen.getByText("Mark all read"));
    expect(api.markAllNotificationsReadApi).toHaveBeenCalled();

    await waitFor(() => expect(rowFor("review the flow")).toHaveAttribute("data-unread", "false"));
    expect(rowFor("pushing deploy")).toHaveAttribute("data-unread", "false");
  });

  it("is disabled once there is nothing unread", async () => {
    api.fetchNotifications.mockResolvedValue({
      items: SEED.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    });
    api.fetchUnreadByChannel.mockResolvedValue({ byChannel: {}, total: 0 });
    api.fetchUnreadCount.mockResolvedValue({ count: 0 });
    renderModule();
    await waitFor(() => expect(queryPreview("review the flow")).not.toBeNull());
    expect(screen.getByText("Mark all read")).toBeDisabled();
  });
});

describe("Clear all", () => {
  it("requires confirmation before calling the API", async () => {
    renderModule();
    await waitFor(() => expect(queryPreview("review the flow")).not.toBeNull());

    fireEvent.click(screen.getByLabelText("More activity actions"));
    fireEvent.click(screen.getByText("Clear all"));

    expect(screen.getByText("Clear all notifications?")).toBeInTheDocument();
    expect(api.clearNotificationsApi).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Clear all notifications?")).not.toBeInTheDocument();
    expect(api.clearNotificationsApi).not.toHaveBeenCalled();
  });

  it("confirming clears the feed via the API", async () => {
    renderModule();
    await waitFor(() => expect(queryPreview("review the flow")).not.toBeNull());

    fireEvent.click(screen.getByLabelText("More activity actions"));
    fireEvent.click(screen.getByText("Clear all"));
    fireEvent.click(screen.getByTestId("confirm-clear-all"));

    expect(api.clearNotificationsApi).toHaveBeenCalled();
    await waitFor(() => expect(queryPreview("review the flow")).toBeNull());
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });
});

describe("Hide (session-local, not a real delete)", () => {
  it("hides the row locally without calling any delete API", async () => {
    renderModule();
    await waitFor(() => expect(queryPreview("review the flow")).not.toBeNull());

    await openRowMenu("review the flow");
    fireEvent.click(screen.getByText("Hide"));

    expect(queryPreview("review the flow")).toBeNull();
    expect(queryPreview("pushing deploy")).not.toBeNull();
    // No per-notification delete endpoint exists — hiding must be purely local.
    expect(api.clearNotificationsApi).not.toHaveBeenCalled();
    expect(api.markNotificationsReadApi).not.toHaveBeenCalled();
  });

  it("does not persist — a remount brings the hidden row back", async () => {
    const { unmount } = renderModule();
    await waitFor(() => expect(queryPreview("review the flow")).not.toBeNull());
    await openRowMenu("review the flow");
    fireEvent.click(screen.getByText("Hide"));
    expect(queryPreview("review the flow")).toBeNull();

    unmount();
    renderModule();
    await waitFor(() => expect(queryPreview("review the flow")).not.toBeNull());
  });
});
