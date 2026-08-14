import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { LiveKitOneToOneCall } from "./LiveKitOneToOneCall";

const mockSetCameraEnabled = vi.fn(async () => undefined);
const mockSetMicrophoneEnabled = vi.fn(async () => undefined);

// A stand-in for a published mic/camera track — just needs a truthy
// `mediaStreamTrack` so the hook builds a non-null MediaStream from it.
const fakePublication = () => ({ isEnabled: true, track: { mediaStreamTrack: {} } });

// A remote participant only appears in room.remoteParticipants once
// `admitRemote()` is called — lets a test simulate the callee joining after
// the caller has already connected to its (empty) room.
let admitRemote: () => void = () => {};
let lastHandlers: Map<string, (arg?: unknown) => void>;

const createMockRoom = () => {
  const handlers = new Map<string, (arg?: unknown) => void>();
  lastHandlers = handlers;
  const remoteParticipants = new Map<string, unknown>();

  const remote = {
    identity: "bob",
    name: "Bob",
    isSpeaking: false,
    // Muted on join — a signal that only becomes visible once this object is
    // actually in room.remoteParticipants, unlike remoteName/remoteUserId
    // (static props CallWindow renders regardless of join state).
    isMicrophoneEnabled: false,
    getTrackPublication: vi.fn(() => fakePublication()),
  };

  admitRemote = () => {
    remoteParticipants.set("bob", remote);
    handlers.get("ParticipantConnected")?.();
  };

  const room = {
    localParticipant: {
      setCameraEnabled: mockSetCameraEnabled,
      setMicrophoneEnabled: mockSetMicrophoneEnabled,
      getTrackPublication: vi.fn(() => fakePublication()),
      isMicrophoneEnabled: true,
      isCameraEnabled: true,
      isScreenShareEnabled: false,
      isSpeaking: false,
    },
    remoteParticipants,
    on: vi.fn((event: string, handler: (arg?: unknown) => void) => {
      handlers.set(event, handler);
      return room;
    }),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
  };
  return room;
};

vi.mock("livekit-client", () => ({
  Room: vi.fn(() => createMockRoom()),
  // Real enum values — use-livekit-room compares against PARTICIPANT_REMOVED at
  // runtime to tell a host removal from an ordinary disconnect.
  DisconnectReason: { CLIENT_INITIATED: 1, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5 },
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

describe("LiveKitOneToOneCall", () => {
  it("reflects the remote participant's live mute state only once they've actually joined", async () => {
    render(
      <LiveKitOneToOneCall
        callId="call-1"
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        localUserId="alice"
        remoteName="Bob"
        remoteUserId="bob"
        callType="video"
        onEndCall={() => undefined}
      />,
    );

    await waitFor(() => expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true));
    // Before join: remote defaults to unmuted (no participant object yet).
    expect(screen.queryByLabelText("Muted")).not.toBeInTheDocument();

    act(() => admitRemote());

    // After join: the mock's isMicrophoneEnabled=false is now visible.
    expect(await screen.findByLabelText("Muted")).toBeInTheDocument();
  });

  it("calls onRemoteJoined exactly once when the other party's tracks appear", async () => {
    const onRemoteJoined = vi.fn();
    render(
      <LiveKitOneToOneCall
        callId="call-1"
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        localUserId="alice"
        remoteName="Bob"
        remoteUserId="bob"
        callType="video"
        onEndCall={() => undefined}
        onRemoteJoined={onRemoteJoined}
      />,
    );

    await waitFor(() => expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true));
    expect(onRemoteJoined).not.toHaveBeenCalled();

    act(() => admitRemote());
    await waitFor(() => expect(onRemoteJoined).toHaveBeenCalledOnce());

    // A later re-render (e.g. a track update) must not re-fire it.
    act(() => {
      lastHandlers.get("TrackSubscribed")?.();
    });
    expect(onRemoteJoined).toHaveBeenCalledOnce();
  });

  it("ends the call when the room disconnects for a reason other than our own hangup", async () => {
    const onEndCall = vi.fn();
    render(
      <LiveKitOneToOneCall
        callId="call-1"
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        localUserId="alice"
        remoteName="Bob"
        remoteUserId="bob"
        callType="video"
        onEndCall={onEndCall}
      />,
    );

    await waitFor(() => expect(lastHandlers.has("Disconnected")).toBe(true));

    act(() => {
      lastHandlers.get("Disconnected")?.(undefined);
    });

    await waitFor(() => expect(onEndCall).toHaveBeenCalledOnce());
  });

  it("never requests the camera for an audio call", async () => {
    render(
      <LiveKitOneToOneCall
        callId="call-1"
        token="token-1"
        livekitUrl="wss://livekit.example.com"
        localUserId="alice"
        remoteName="Bob"
        remoteUserId="bob"
        callType="audio"
        onEndCall={() => undefined}
      />,
    );

    await waitFor(() => expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true));
    expect(mockSetCameraEnabled).not.toHaveBeenCalled();
  });
});
