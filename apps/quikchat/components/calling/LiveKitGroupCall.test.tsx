import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LiveKitGroupCall } from "./LiveKitGroupCall";

const mockDisconnect = vi.fn();
const mockSetCameraEnabled = vi.fn();
const mockSetMicrophoneEnabled = vi.fn();
const mockOn = vi.fn();

const createMockRoom = (
  overrides: {
    connectError?: Error;
    cameraError?: Error;
    micError?: Error;
  } = {},
) => {
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

  return {
    localParticipant,
    remoteParticipants: new Map(),
    on: mockOn.mockReturnThis(),
    connect: vi.fn(async () => {
      if (overrides.connectError) throw overrides.connectError;
    }),
    disconnect: mockDisconnect,
  };
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
  it("joins the room and enables camera + microphone", async () => {
    render(
      <LiveKitGroupCall
        roomId="room-1"
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
        onEndCall={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(mockSetCameraEnabled).toHaveBeenCalledWith(true);
      expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true);
    });
  });

  it("continues with audio-only when camera enable fails", async () => {
    const { Room } = await import("livekit-client");
    (Room as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      createMockRoom({ cameraError: new Error("Camera not found") }),
    );

    render(
      <LiveKitGroupCall
        roomId="room-1"
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
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
        roomId="room-1"
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        callId="call-1"
        localUserId="user-1"
        onEndCall={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Media Error")).toBeInTheDocument();
    });
  });
});
