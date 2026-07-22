import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
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

describe("CallHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
