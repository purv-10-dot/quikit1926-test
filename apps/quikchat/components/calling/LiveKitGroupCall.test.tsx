import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { LiveKitGroupCall } from "./LiveKitGroupCall";

const mockDisconnect = vi.fn();
const mockSetCameraEnabled = vi.fn();
const mockSetMicrophoneEnabled = vi.fn();

// Handlers registered via room.on(event, handler) for the MOST RECENTLY
// created mock room — lets a test fire a room event directly.
let lastHandlers: Map<string, (arg?: unknown) => void>;

const createMockRoom = (
  overrides: {
    connectError?: Error;
    cameraError?: Error;
    micError?: Error;
  } = {},
) => {
  const handlers = new Map<string, (arg?: unknown) => void>();
  lastHandlers = handlers;

  const localParticipant = {
    setCameraEnabled: mockSetCameraEnabled.mockImplementation(async () => {
      if (overrides.cameraError) throw overrides.cameraError;
    }),
    setMicrophoneEnabled: mockSetMicrophoneEnabled.mockImplementation(async () => {
      if (overrides.micError) throw overrides.micError;
    }),
    getTrackPublication: vi.fn(() => null),
    isMicrophoneEnabled: true,
    isCameraEnabled: true,
    isScreenShareEnabled: false,
  };

  const room = {
    localParticipant,
    remoteParticipants: new Map(),
    on: vi.fn((event: string, handler: (arg?: unknown) => void) => {
      handlers.set(event, handler);
      return room;
    }),
    connect: vi.fn(async () => {
      if (overrides.connectError) throw overrides.connectError;
    }),
    disconnect: mockDisconnect,
  };
  return room;
};

vi.mock("livekit-client", () => ({
  Room: vi.fn(() => createMockRoom()),
  RoomEvent: {
    ParticipantConnected: "ParticipantConnected",
    ParticipantDisconnected: "ParticipantDisconnected",
    TrackSubscribed: "TrackSubscribed",
    TrackUnsubscribed: "TrackUnsubscribed",
    LocalTrackPublished: "LocalTrackPublished",
    LocalTrackUnpublished: "LocalTrackUnpublished",
    ActiveSpeakersChanged: "ActiveSpeakersChanged",
    Disconnected: "Disconnected",
    Reconnecting: "Reconnecting",
    Reconnected: "Reconnected",
  },
  Track: {
    Source: { Camera: "camera", Microphone: "microphone", ScreenShare: "screen_share" },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LiveKitGroupCall", () => {
  it("joins the room and enables camera + microphone for a video call", async () => {
    render(
      <LiveKitGroupCall
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
        callType="video"
        isHost={true}
        onEndCall={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(mockSetCameraEnabled).toHaveBeenCalledWith(true);
      expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true);
    });
  });

  it("never requests the camera for an audio call", async () => {
    render(
      <LiveKitGroupCall
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
        callType="audio"
        isHost={true}
        onEndCall={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true);
    });
    expect(mockSetCameraEnabled).not.toHaveBeenCalled();
  });

  it("continues with audio-only when camera enable fails", async () => {
    const { Room } = await import("livekit-client");
    (Room as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      createMockRoom({ cameraError: new Error("Camera not found") }),
    );

    render(
      <LiveKitGroupCall
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
        callType="video"
        isHost={true}
        onEndCall={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(mockSetCameraEnabled).toHaveBeenCalledWith(true);
      expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true);
    });
  });

  it("shows a media error when both camera and microphone fail", async () => {
    const { Room } = await import("livekit-client");
    (Room as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      createMockRoom({
        cameraError: new Error("Camera not found"),
        micError: new Error("Microphone denied"),
      }),
    );

    render(
      <LiveKitGroupCall
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
        callType="video"
        isHost={true}
        onEndCall={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Media Error")).toBeInTheDocument();
    });
  });

  it("ends the call when the room disconnects for a reason other than our own hangup (room deleted / kicked)", async () => {
    const onEndCall = vi.fn();
    render(
      <LiveKitGroupCall
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
        callType="video"
        isHost={true}
        onEndCall={onEndCall}
      />,
    );

    await waitFor(() => expect(lastHandlers.has("Disconnected")).toBe(true));
    expect(onEndCall).not.toHaveBeenCalled();

    // Server-initiated disconnect (e.g. the other party ended the call and the
    // room was deleted) — must end the call, not show "Reconnecting…" forever.
    act(() => {
      lastHandlers.get("Disconnected")?.(undefined);
    });

    await waitFor(() => expect(onEndCall).toHaveBeenCalledOnce());
  });

  it("host clicking Mute All calls the mute-all API for this call, and it's hidden for a non-host", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchSpy);

    const { rerender } = render(
      <LiveKitGroupCall
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
        callType="video"
        isHost={true}
        onEndCall={() => undefined}
      />,
    );

    // HostControls only renders inside the participant-list sidebar.
    const showParticipantsButton = await screen.findByLabelText("Show participants");
    showParticipantsButton.click();

    const muteAllButton = await screen.findByTestId("mute-all-button");
    muteAllButton.click();

    expect(fetchSpy).toHaveBeenCalledWith("/api/calls/call-1/mute-all", { method: "POST" });

    rerender(
      <LiveKitGroupCall
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
        callType="video"
        isHost={false}
        onEndCall={() => undefined}
      />,
    );
    expect(screen.queryByTestId("mute-all-button")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
