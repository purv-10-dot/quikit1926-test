// @vitest-environment jsdom
/**
 * The removed-from-call explanation, mounted at last.
 *
 * `RemovedFromCallToast` was complete and tested but never rendered anywhere,
 * so a kicked participant's window simply closed. These assert the MOUNT and
 * the discrimination — that the toast appears only for an explicit
 * PARTICIPANT_REMOVED, and that every other ending keeps the previous
 * close-immediately behaviour. Claiming "you were removed" on an ordinary
 * hangup would be worse than the silence this replaces.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ room: vi.fn() }));

vi.mock("@/lib/use-livekit-room", () => ({ useLiveKitRoom: h.room }));
// The grid and controls pull in media APIs jsdom has no business simulating;
// this file is about which BRANCH renders, not what the call looks like.
vi.mock("./GroupCallGrid", () => ({ GroupCallGrid: () => <div data-testid="grid" /> }));
vi.mock("./CallControls", () => ({ CallControls: () => <div data-testid="controls" /> }));

import { LiveKitGroupCall } from "./LiveKitGroupCall";

function roomState(over: Record<string, unknown> = {}) {
  return {
    participants: [],
    isMuted: false,
    isCameraOff: false,
    isScreenSharing: false,
    localScreenShareStream: null,
    mediaError: null,
    isReconnecting: false,
    terminalDisconnect: false,
    removedByHost: false,
    toggleMute: vi.fn(),
    toggleCamera: vi.fn(),
    toggleScreenShare: vi.fn(),
    handleDeviceChange: vi.fn(),
    disconnect: vi.fn(),
    retryMedia: vi.fn(),
    ...over,
  };
}

function renderCall(onEndCall = vi.fn()) {
  render(
    <LiveKitGroupCall
      token="t"
      livekitUrl="wss://lk.test"
      callId="call-1"
      localUserId="u-me"
      callType="video"
      isHost={false}
      channelName="general"
      onEndCall={onEndCall}
    />,
  );
  return onEndCall;
}

beforeEach(() => h.room.mockReset());

describe("LiveKitGroupCall — removed by host", () => {
  it("explains the removal instead of closing silently", () => {
    h.room.mockReturnValue(roomState({ terminalDisconnect: true, removedByHost: true }));
    const onEndCall = renderCall();

    expect(screen.getByText(/removed/i)).toBeInTheDocument();
    expect(screen.getByText(/general/)).toBeInTheDocument();
    // The window must stay open long enough to be read — the auto-end effect is
    // suppressed for this branch and runs on dismiss instead.
    expect(onEndCall).not.toHaveBeenCalled();
  });

  it("ends the call normally when the room just ended", () => {
    // Same terminalDisconnect, no removal: previous behaviour, no explanation.
    h.room.mockReturnValue(roomState({ terminalDisconnect: true, removedByHost: false }));
    const onEndCall = renderCall();

    expect(screen.queryByText(/removed/i)).toBeNull();
    expect(onEndCall).toHaveBeenCalled();
  });

  it("renders the call normally while connected", () => {
    h.room.mockReturnValue(roomState());
    const onEndCall = renderCall();

    expect(screen.getByTestId("grid")).toBeInTheDocument();
    expect(screen.queryByText(/removed/i)).toBeNull();
    expect(onEndCall).not.toHaveBeenCalled();
  });
});
