import type { NotificationSettingsDto } from "@/lib/shared";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Ringtone gating reads the user's notification settings; mock the API client so
// it's deterministic (the blanket global.fetch below would otherwise answer it).
const api = { fetchNotificationSettings: vi.fn() };
vi.mock("@/lib/api", () => ({
  fetchNotificationSettings: () => api.fetchNotificationSettings(),
}));

// The ring itself — assert the start/stop lifecycle, not the oscillators
// (lib/call-sounds.test.ts covers those).
const ring = { start: vi.fn(), stop: vi.fn() };
vi.mock("@/lib/call-sounds", () => ({
  startRingtone: () => {
    ring.start();
    return ring.stop;
  },
}));

import { CallHandler } from "./CallHandler";

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock navigator.mediaDevices
Object.defineProperty(navigator, "mediaDevices", {
  value: {
    getUserMedia: vi.fn().mockResolvedValue(new MediaStream()),
  },
  writable: true,
});

function settings(over: Partial<NotificationSettingsDto> = {}): NotificationSettingsDto {
  return {
    defaultChannelLevel: "all",
    dmsLevel: "all",
    soundEnabled: true,
    callSoundsEnabled: true,
    desktopEnabled: true,
    emailEnabled: false,
    dndEnabled: false,
    dndStart: null,
    dndEnd: null,
    snoozedUntil: null,
    priorityDuringDnd: true,
    ...over,
  };
}

describe("CallHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchNotificationSettings.mockResolvedValue(settings());
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "call-123" }),
    });
  });

  it("renders nothing when no active call or incoming call", () => {
    const { container } = render(
      <CallHandler
        currentUserId="user-1"
        currentUserName="Alice"
        socket={{ on: vi.fn(), off: vi.fn(), emit: vi.fn() }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders IncomingCallToast when socket emits call:ringing", async () => {
    const mockOn = vi.fn();
    const socket = { on: mockOn, off: vi.fn(), emit: vi.fn() };

    render(<CallHandler currentUserId="user-1" currentUserName="Alice" socket={socket} />);

    // Find the call:ringing handler
    const ringingHandler = mockOn.mock.calls.find(([event]) => event === "call:ringing")?.[1];
    expect(ringingHandler).toBeDefined();

    // Simulate incoming call
    ringingHandler({
      callId: "call-123",
      type: "video",
      initiatorId: "user-2",
    });

    expect(await screen.findByTestId("incoming-call-toast")).toBeTruthy();
    expect(screen.getByText("User")).toBeTruthy();
    expect(screen.getByText("Video call")).toBeTruthy();
  });

  it("does not show toast for own calls", async () => {
    const mockOn = vi.fn();
    const socket = { on: mockOn, off: vi.fn(), emit: vi.fn() };

    render(<CallHandler currentUserId="user-1" currentUserName="Alice" socket={socket} />);

    const ringingHandler = mockOn.mock.calls.find(([event]) => event === "call:ringing")?.[1];

    // Simulate own call
    ringingHandler({
      callId: "call-123",
      type: "video",
      initiatorId: "user-1",
    });

    expect(screen.queryByTestId("incoming-call-toast")).toBeNull();
  });

  it("initiates outbound call when callTargetUserId is set", async () => {
    const mockEmit = vi.fn();
    const socket = { on: vi.fn(), off: vi.fn(), emit: mockEmit };
    const onCallStarted = vi.fn();

    render(
      <CallHandler
        currentUserId="user-1"
        currentUserName="Alice"
        socket={socket}
        callTargetUserId="user-2"
        onCallStarted={onCallStarted}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "video",
          targetUserIds: ["user-2"],
        }),
      });
    });

    await waitFor(() => {
      expect(mockEmit).toHaveBeenCalledWith("call:invite", {
        callId: "call-123",
        targetUserId: "user-2",
      });
    });

    await waitFor(() => {
      expect(onCallStarted).toHaveBeenCalled();
    });
  });

  it("cleans up socket listeners on unmount", () => {
    const mockOff = vi.fn();
    const socket = { on: vi.fn(), off: mockOff, emit: vi.fn() };

    const { unmount } = render(
      <CallHandler currentUserId="user-1" currentUserName="Alice" socket={socket} />,
    );

    unmount();

    expect(mockOff).toHaveBeenCalledWith("call:ringing", expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith("call:cancelled", expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith("call:ended", expect.any(Function));
  });
});

// The ring is gated; the TOAST never is. Every dismissal path funnels through
// setIncoming(null), so one effect cleanup covers them all.
describe("CallHandler ringtone", () => {
  type Handlers = Record<string, (data: unknown) => void>;

  /** Mount, wait for the settings fetch to land, and expose the socket handlers. */
  async function mount(over: Partial<NotificationSettingsDto> = {}) {
    api.fetchNotificationSettings.mockResolvedValue(settings(over));
    const handlers: Handlers = {};
    const socket = {
      on: (event: string, h: (data: unknown) => void) => {
        handlers[event] = h;
      },
      off: vi.fn(),
      emit: vi.fn(),
    };
    const utils = render(
      <CallHandler currentUserId="user-1" currentUserName="Alice" socket={socket} />,
    );
    // Settings are read when a call ARRIVES, so let the fetch resolve first.
    await waitFor(() => expect(api.fetchNotificationSettings).toHaveBeenCalled());
    await act(async () => {});
    const incoming = () =>
      act(() => {
        handlers["call:ringing"]!({ callId: "call-123", type: "video", initiatorId: "user-2" });
      });
    return { ...utils, handlers, incoming };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchNotificationSettings.mockResolvedValue(settings());
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "call-123" }) });
  });

  it("starts ringing when a call arrives", async () => {
    const { incoming } = await mount();
    expect(ring.start).not.toHaveBeenCalled();
    incoming();
    expect(ring.start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("incoming-call-toast")).toBeTruthy();
  });

  it.each([
    ["call:cancelled"],
    ["call:ended"],
    ["call:rejected"],
    ["call:timed_out"],
  ])("stops ringing on %s", async (event) => {
    const { handlers, incoming } = await mount();
    incoming();
    expect(ring.start).toHaveBeenCalledTimes(1);

    act(() => handlers[event]!({ callId: "call-123" }));

    expect(ring.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("incoming-call-toast")).toBeNull();
  });

  it("stops ringing when the call is declined", async () => {
    const { incoming } = await mount();
    incoming();
    await act(async () => {
      screen.getByTestId("incoming-call-toast").querySelector("button")?.click();
    });
    expect(ring.stop).toHaveBeenCalled();
  });

  it("stops ringing on unmount (no loop outlives the component)", async () => {
    const { incoming, unmount } = await mount();
    incoming();
    expect(ring.start).toHaveBeenCalledTimes(1);
    unmount();
    expect(ring.stop).toHaveBeenCalledTimes(1);
  });

  it("does not ring when call sounds are off — but still shows the toast", async () => {
    const { incoming } = await mount({ callSoundsEnabled: false });
    incoming();
    expect(ring.start).not.toHaveBeenCalled();
    expect(screen.getByTestId("incoming-call-toast")).toBeTruthy();
  });

  it("does not ring during DND — but still shows the toast", async () => {
    // A window covering the whole day, so this holds whenever the suite runs.
    const { incoming } = await mount({
      dndEnabled: true,
      dndStart: "00:00",
      dndEnd: "23:59",
    });
    incoming();
    expect(ring.start).not.toHaveBeenCalled();
    expect(screen.getByTestId("incoming-call-toast")).toBeTruthy();
  });

  it("rings when DND is configured but the current time is outside the window", async () => {
    const { incoming } = await mount({
      dndEnabled: true,
      dndStart: "00:00",
      dndEnd: "00:00", // start === end ⇒ never in-window
    });
    incoming();
    expect(ring.start).toHaveBeenCalledTimes(1);
  });

  it("does not ring while snoozed — but still shows the toast", async () => {
    const { incoming } = await mount({
      snoozedUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    incoming();
    expect(ring.start).not.toHaveBeenCalled();
    expect(screen.getByTestId("incoming-call-toast")).toBeTruthy();
  });

  it("rings once an expired snooze has lapsed", async () => {
    const { incoming } = await mount({
      snoozedUntil: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    incoming();
    expect(ring.start).toHaveBeenCalledTimes(1);
  });

  it("stays silent if the settings fetch failed", async () => {
    api.fetchNotificationSettings.mockRejectedValue(new Error("offline"));
    const handlers: Handlers = {};
    const socket = {
      on: (e: string, h: (d: unknown) => void) => {
        handlers[e] = h;
      },
      off: vi.fn(),
      emit: vi.fn(),
    };
    render(<CallHandler currentUserId="user-1" currentUserName="Alice" socket={socket} />);
    await act(async () => {});
    act(() => {
      handlers["call:ringing"]!({ callId: "call-123", type: "video", initiatorId: "user-2" });
    });
    expect(ring.start).not.toHaveBeenCalled();
    expect(screen.getByTestId("incoming-call-toast")).toBeTruthy(); // visuals unaffected
  });

  it("does not ring for our own outgoing call", async () => {
    const { handlers } = await mount();
    act(() => {
      handlers["call:ringing"]!({ callId: "call-123", type: "video", initiatorId: "user-1" });
    });
    expect(ring.start).not.toHaveBeenCalled();
  });
});

describe("CallHandler (legacy socket cleanup)", () => {
  it("cleans up socket listeners on unmount", () => {
    const mockOff = vi.fn();
    const socket = { on: vi.fn(), off: mockOff, emit: vi.fn() };

    const { unmount } = render(
      <CallHandler currentUserId="user-1" currentUserName="Alice" socket={socket} />,
    );

    unmount();

    expect(mockOff).toHaveBeenCalledWith("call:ringing", expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith("call:cancelled", expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith("call:ended", expect.any(Function));
  });
});
