import type { NotificationDto, NotificationRealtimePayload } from "@/lib/shared";
import { ToastProvider } from "@/components/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- mock the API client the provider seeds + reconciles against ---
const api = {
  fetchNotifications: vi.fn(),
  fetchUnreadByChannel: vi.fn(),
  fetchUnreadCount: vi.fn(),
  markNotificationsReadApi: vi.fn(),
  markAllNotificationsReadApi: vi.fn(),
  markChannelNotificationsReadApi: vi.fn(),
  clearNotificationsApi: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  fetchNotifications: (...a: unknown[]) => api.fetchNotifications(...a),
  fetchUnreadByChannel: (...a: unknown[]) => api.fetchUnreadByChannel(...a),
  fetchUnreadCount: (...a: unknown[]) => api.fetchUnreadCount(...a),
  markNotificationsReadApi: (...a: unknown[]) => api.markNotificationsReadApi(...a),
  markAllNotificationsReadApi: (...a: unknown[]) => api.markAllNotificationsReadApi(...a),
  markChannelNotificationsReadApi: (...a: unknown[]) => api.markChannelNotificationsReadApi(...a),
  clearNotificationsApi: (...a: unknown[]) => api.clearNotificationsApi(...a),
}));

// --- mock the web-notification helpers (focus/permission/OS fire) ---
const web = {
  focused: true,
  permission: "granted" as string,
  fire: vi.fn(),
};
vi.mock("@/lib/web-notifications", () => ({
  notificationsSupported: () => true,
  permissionState: () => web.permission,
  isAppFocused: () => web.focused,
  requestPermission: vi.fn(async () => web.permission),
  fireOsNotification: (...a: unknown[]) => web.fire(...a),
  shouldFireOsNotification: (desktop: boolean) =>
    desktop && !web.focused && web.permission === "granted",
}));

// --- mock the chime (WebAudio can't run in jsdom; we assert the routing) ---
const sound = { play: vi.fn() };
vi.mock("@/lib/notification-sound", () => ({
  playNotificationSound: () => sound.play(),
  notificationSoundSupported: () => true,
}));

import { NotificationBell } from "./NotificationBell";
import {
  NotificationProvider,
  useNotifications,
  type NotifRealtimeClient,
} from "./NotificationProvider";

let inbound: ((p: NotificationRealtimePayload) => void) | null = null;
const fakeClient: NotifRealtimeClient = {
  on: (event, handler) => {
    if (event === "notification") inbound = handler as (p: NotificationRealtimePayload) => void;
  },
  off: () => undefined,
};
const opener = vi.fn();

function Harness() {
  const n = useNotifications();
  useEffect(() => {
    n.attachClient(fakeClient);
    n.registerChannelOpener(opener);
  }, [n]);
  return (
    <>
      <NotificationBell />
      {/* Field names only (never values) so this can't collide with the text
          queries other tests run — used to assert the transient alert flags
          don't leak into the stored row. */}
      <span data-testid="top-row-keys">{Object.keys(n.feed[0] ?? {}).join(",")}</span>
    </>
  );
}

function dto(
  over: Partial<NotificationDto> & {
    meta?: Record<string, unknown>;
    desktop?: boolean;
    sound?: boolean;
  },
): NotificationDto {
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
  dto({ id: "1", type: "mention", channelId: "c1", preview: "review the flow" }),
  dto({
    id: "2",
    type: "keyword",
    channelId: "c1",
    meta: { channelName: "design", channelType: "group", actorName: "Arjun", keyword: "deploy" },
    preview: "pushing deploy",
  }),
  dto({
    id: "3",
    type: "dm",
    channelId: "dmX",
    isRead: true,
    meta: { channelName: "Priya", channelType: "dm", actorName: "Priya" },
    preview: "still on for 3pm?",
  }),
];

function renderBell() {
  return render(
    <ToastProvider>
      <NotificationProvider>
        <Harness />
      </NotificationProvider>
    </ToastProvider>,
  );
}

async function openPanel() {
  fireEvent.click(screen.getByLabelText("Notifications"));
  await screen.findByText("Notifications");
}

beforeEach(() => {
  inbound = null;
  opener.mockReset();
  web.focused = true;
  web.permission = "granted";
  web.fire.mockReset();
  sound.play.mockReset();
  api.fetchNotifications.mockResolvedValue({ items: SEED, unreadCount: 2 });
  api.fetchUnreadByChannel.mockResolvedValue({ byChannel: { c1: 2 }, total: 2 });
  api.fetchUnreadCount.mockResolvedValue({ count: 2 });
  api.markNotificationsReadApi.mockResolvedValue({ unreadCount: 1 });
  api.markAllNotificationsReadApi.mockResolvedValue({ unreadCount: 0 });
  api.markChannelNotificationsReadApi.mockResolvedValue({ affected: 2, unreadCount: 0 });
  api.clearNotificationsApi.mockResolvedValue({ unreadCount: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("NotificationBell feed", () => {
  it("seeds the badge and renders the grouped feed with per-type summaries", async () => {
    renderBell();
    // Badge seeded from the unread count.
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    await openPanel();

    // Grouped: #design (2) and the DM with Priya (1).
    expect(screen.getByText(/#design · 2/)).toBeInTheDocument();
    expect(screen.getByText(/Priya · 1/)).toBeInTheDocument();

    // Summaries per type.
    expect(screen.getByText("mentioned you")).toBeInTheDocument();
    expect(screen.getByText("keyword “deploy”")).toBeInTheDocument();
    expect(screen.getByText("sent you a message")).toBeInTheDocument();
  });

  it("Unread tab filters out read rows", async () => {
    renderBell();
    await openPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    expect(screen.queryByText("sent you a message")).not.toBeInTheDocument(); // id 3 is read
    expect(screen.getByText("mentioned you")).toBeInTheDocument();
  });

  it("row click marks read + opens the channel", async () => {
    renderBell();
    await openPanel();
    fireEvent.click(screen.getByText("review the flow"));
    expect(api.markNotificationsReadApi).toHaveBeenCalledWith(["1"]);
    expect(opener).toHaveBeenCalledWith("c1", "m1");
  });

  it("mark all read clears the badge", async () => {
    renderBell();
    await openPanel();
    fireEvent.click(screen.getByText("Mark all read"));
    expect(api.markAllNotificationsReadApi).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("2")).not.toBeInTheDocument());
  });

  it("shows the empty state when there are no notifications", async () => {
    api.fetchNotifications.mockResolvedValue({ items: [], unreadCount: 0 });
    api.fetchUnreadByChannel.mockResolvedValue({ byChannel: {}, total: 0 });
    renderBell();
    await openPanel();
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });
});

describe("inbound realtime + toast/OS routing", () => {
  it("prepends an inbound notification and bumps the badge", async () => {
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(
        dto({
          id: "9",
          preview: "brand new mention",
          desktop: true,
        }) as NotificationRealtimePayload,
      );
    });
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument()); // 2 → 3
  });

  it("focused inbound shows a toast; does NOT fire an OS notification", async () => {
    web.focused = true;
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(
        dto({
          id: "9",
          preview: "focused toast body",
          desktop: true,
        }) as NotificationRealtimePayload,
      );
    });
    expect(await screen.findByText("focused toast body")).toBeInTheDocument();
    expect(web.fire).not.toHaveBeenCalled();
  });

  it("unfocused inbound with desktop+granted fires an OS notification, no toast", async () => {
    web.focused = false;
    web.permission = "granted";
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(
        dto({
          id: "9",
          preview: "should be OS only",
          desktop: true,
        }) as NotificationRealtimePayload,
      );
    });
    expect(web.fire).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("should be OS only")).not.toBeInTheDocument();
  });

  // Regression: the desktop bridge builds `quikchat://open/<channelId>` from
  // `channelId`, so it must be passed separately from `tag` — `tag` falls back to
  // the message id, and sending that as a channel id deep-links nowhere.
  it("forwards channelId to the OS notification separately from tag", async () => {
    web.focused = false;
    web.permission = "granted";
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());

    await act(async () => {
      inbound!(dto({ id: "9", channelId: "c1", desktop: true }) as NotificationRealtimePayload);
    });
    expect(web.fire).toHaveBeenLastCalledWith(
      expect.objectContaining({ channelId: "c1", tag: "c1" }),
    );

    // No channel (e.g. a system row): `tag` degrades to the id, `channelId` stays
    // null rather than inheriting that id.
    await act(async () => {
      inbound!(dto({ id: "10", channelId: null, desktop: true }) as NotificationRealtimePayload);
    });
    expect(web.fire).toHaveBeenLastCalledWith(
      expect.objectContaining({ channelId: null, tag: "10" }),
    );
  });

  it("desktop:false never fires an OS notification even when unfocused", async () => {
    web.focused = false;
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(dto({ id: "9", desktop: false }) as NotificationRealtimePayload);
    });
    expect(web.fire).not.toHaveBeenCalled();
  });

  // Sound routing. The server already applied mute/snooze/DND/soundEnabled, so
  // the client's only job is the focus split: the toast gets an audible cue, the
  // OS notification brings its own.
  it("focused inbound with sound:true plays the chime alongside the toast", async () => {
    web.focused = true;
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(
        dto({
          id: "9",
          preview: "audible toast",
          desktop: true,
          sound: true,
        }) as NotificationRealtimePayload,
      );
    });
    expect(await screen.findByText("audible toast")).toBeInTheDocument();
    expect(sound.play).toHaveBeenCalledTimes(1);
  });

  it("focused inbound with sound:false is silent (toast still shows)", async () => {
    web.focused = true;
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(
        dto({
          id: "9",
          preview: "silent toast",
          desktop: true,
          sound: false,
        }) as NotificationRealtimePayload,
      );
    });
    expect(await screen.findByText("silent toast")).toBeInTheDocument();
    expect(sound.play).not.toHaveBeenCalled();
  });

  // sound is gated on soundEnabled ALONE — a user who turned desktop popups off
  // must still hear the chime.
  it("focused inbound with sound:true + desktop:false still plays", async () => {
    web.focused = true;
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(dto({ id: "9", desktop: false, sound: true }) as NotificationRealtimePayload);
    });
    expect(sound.play).toHaveBeenCalledTimes(1);
  });

  it("unfocused inbound does NOT play — the OS notification carries its own sound", async () => {
    web.focused = false;
    web.permission = "granted";
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(dto({ id: "9", desktop: true, sound: true }) as NotificationRealtimePayload);
    });
    expect(web.fire).toHaveBeenCalledTimes(1);
    expect(sound.play).not.toHaveBeenCalled(); // no double-alert
  });

  it("a pre-read (muted) row is silent even if the sound flag is set", async () => {
    web.focused = true;
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(
        dto({ id: "9", isRead: true, desktop: false, sound: true }) as NotificationRealtimePayload,
      );
    });
    expect(sound.play).not.toHaveBeenCalled();
  });

  it("strips the transient desktop/sound flags from the stored row", async () => {
    renderBell();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(dto({ id: "9", desktop: true, sound: true }) as NotificationRealtimePayload);
    });
    const keys = screen.getByTestId("top-row-keys").textContent!.split(",");
    expect(keys).not.toContain("sound");
    expect(keys).not.toContain("desktop");
    expect(keys).toContain("preview"); // sanity: it IS the inbound row
  });

  it("a muted (isRead) inbound updates the feed but not the badge", async () => {
    renderBell();
    await openPanel();
    await waitFor(() => expect(inbound).not.toBeNull());
    await act(async () => {
      inbound!(
        dto({
          id: "9",
          isRead: true,
          preview: "muted row",
          desktop: false,
        }) as NotificationRealtimePayload,
      );
    });
    expect(screen.getByText("muted row")).toBeInTheDocument();
    // Badge stays at the seeded 2 (no bump for a read row).
    expect(screen.getByLabelText("2 unread")).toBeInTheDocument();
  });
});
