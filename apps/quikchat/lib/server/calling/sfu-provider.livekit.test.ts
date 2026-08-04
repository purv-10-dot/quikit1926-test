import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addGrant = vi.fn();
const toJwt = vi.fn(async () => "signed-jwt");
const createRoom = vi.fn(async () => undefined);
const deleteRoom = vi.fn(async () => undefined);
const getParticipant = vi.fn();
const listParticipants = vi.fn();
const mutePublishedTrack = vi.fn(async () => undefined);

// Real TrackSource is a numeric protobuf enum, not string names — using
// numbers here (matching production) is what exposed the original bug: code
// that compared `t.source === "MICROPHONE"` never matched.
const TrackSource = { CAMERA: 1, MICROPHONE: 2, SCREEN_SHARE: 3, SCREEN_SHARE_AUDIO: 4 };

vi.mock("livekit-server-sdk", () => ({
  AccessToken: vi.fn().mockImplementation(() => ({ addGrant, toJwt })),
  RoomServiceClient: vi.fn().mockImplementation(() => ({
    createRoom,
    deleteRoom,
    getParticipant,
    listParticipants,
    mutePublishedTrack,
  })),
  TrackSource,
}));

describe("LiveSFUProvider", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LIVEKIT_URL = "wss://test.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("creates a room with a short emptyTimeout (bounded billed minutes on an abandoned room)", async () => {
    const { LiveSFUProvider } = await import("./sfu-provider.livekit");
    const provider = new LiveSFUProvider();
    const room = await provider.createRoom("call-123");

    expect(room.roomId).toBe("call-123");
    expect(createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ name: "call-123", emptyTimeout: 60 }),
    );
  });

  it("mints a token with roomJoin/publish/subscribe grants but no roomAdmin by default", async () => {
    const { LiveSFUProvider } = await import("./sfu-provider.livekit");
    const provider = new LiveSFUProvider();
    const token = await provider.generateToken("call-123", "user-1", "Alice");

    expect(token).toBe("signed-jwt");
    expect(addGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        room: "call-123",
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: false,
      }),
    );
  });

  it("grants roomAdmin only when opts.isHost is true", async () => {
    const { LiveSFUProvider } = await import("./sfu-provider.livekit");
    const provider = new LiveSFUProvider();
    await provider.generateToken("call-123", "user-1", "Alice", { isHost: true });

    expect(addGrant).toHaveBeenCalledWith(expect.objectContaining({ roomAdmin: true }));
  });

  it("mints a token with a bounded TTL matching the call's hard duration cap, not an unbounded/24h token", async () => {
    const { AccessToken } = await import("livekit-server-sdk");
    const { LiveSFUProvider } = await import("./sfu-provider.livekit");
    const provider = new LiveSFUProvider();
    await provider.generateToken("call-123", "user-1", "Alice");

    expect(AccessToken).toHaveBeenCalledWith(
      "test-key",
      "test-secret",
      expect.objectContaining({ identity: "user-1", name: "Alice", ttl: 4 * 60 * 60 }),
    );
  });

  it("throws when LiveKit env vars are missing rather than silently minting an unusable token", async () => {
    delete process.env.LIVEKIT_API_KEY;
    const { LiveSFUProvider } = await import("./sfu-provider.livekit");
    const provider = new LiveSFUProvider();

    await expect(provider.generateToken("call-123", "user-1", "Alice")).rejects.toThrow(
      /LiveKit not configured/,
    );
  });

  it("deleteRoom calls the room service and swallows a not-found error", async () => {
    deleteRoom.mockRejectedValueOnce(new Error("room not found"));
    const { LiveSFUProvider } = await import("./sfu-provider.livekit");
    const provider = new LiveSFUProvider();

    await expect(provider.deleteRoom("call-123")).resolves.toBeUndefined();
    expect(deleteRoom).toHaveBeenCalledWith("call-123");
  });

  it("listParticipants reports isMuted/hasVideo from the actual track sources, not always-false", async () => {
    listParticipants.mockResolvedValueOnce([
      {
        sid: "p1",
        identity: "user-1",
        name: "Alice",
        tracks: [
          { source: TrackSource.MICROPHONE, muted: false, sid: "t1" },
          { source: TrackSource.CAMERA, muted: true, sid: "t2" },
        ],
      },
    ]);
    const { LiveSFUProvider } = await import("./sfu-provider.livekit");
    const provider = new LiveSFUProvider();

    const [participant] = await provider.listParticipants("call-123");

    expect(participant!.isMuted).toBe(false); // unmuted mic track present
    expect(participant!.hasVideo).toBe(false); // camera track is muted
  });

  it("muteParticipant mutes the microphone track, not the camera", async () => {
    getParticipant.mockResolvedValueOnce({
      identity: "user-1",
      tracks: [
        { source: TrackSource.CAMERA, sid: "cam-1" },
        { source: TrackSource.MICROPHONE, sid: "mic-1" },
      ],
    });
    const { LiveSFUProvider } = await import("./sfu-provider.livekit");
    const provider = new LiveSFUProvider();

    await provider.muteParticipant("call-123", "user-1", true);

    expect(mutePublishedTrack).toHaveBeenCalledWith("call-123", "user-1", "mic-1", true);
    expect(mutePublishedTrack).not.toHaveBeenCalledWith("call-123", "user-1", "cam-1", true);
  });

  it("muteAllParticipants mutes every unmuted microphone track, excluding the given identity", async () => {
    listParticipants.mockResolvedValueOnce([
      {
        identity: "host",
        tracks: [{ source: TrackSource.MICROPHONE, sid: "mic-host", muted: false }],
      },
      {
        identity: "user-1",
        tracks: [{ source: TrackSource.MICROPHONE, sid: "mic-1", muted: false }],
      },
      {
        identity: "user-2",
        tracks: [
          { source: TrackSource.CAMERA, sid: "cam-2", muted: false },
          { source: TrackSource.MICROPHONE, sid: "mic-2", muted: true }, // already muted
        ],
      },
    ]);
    const { LiveSFUProvider } = await import("./sfu-provider.livekit");
    const provider = new LiveSFUProvider();

    await provider.muteAllParticipants("call-123", "host");

    expect(mutePublishedTrack).toHaveBeenCalledTimes(1);
    expect(mutePublishedTrack).toHaveBeenCalledWith("call-123", "user-1", "mic-1", true);
  });
});
