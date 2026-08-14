import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addGrant = vi.fn();
const toJwt = vi.fn(async () => "signed-jwt");
const createRoom = vi.fn(async () => undefined);
const deleteRoom = vi.fn(async () => undefined);
const getParticipant = vi.fn();
const listParticipants = vi.fn();
const mutePublishedTrack = vi.fn(async () => undefined);
const removeParticipant = vi.fn(async () => undefined);

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
    removeParticipant,
  })),
  TrackSource,
}));

/** Fields a logged LiveKit failure must carry — never the error object itself. */
function expectLoggedFailure(
  logError: ReturnType<typeof vi.spyOn>,
  extra: Record<string, unknown>,
) {
  expect(logError).toHaveBeenCalledTimes(1);
  const [fields] = logError.mock.calls[0]! as [Record<string, unknown>, string];
  expect(fields).toMatchObject({ errName: "Error", errMessage: "boom", ...extra });
  expect(fields).not.toHaveProperty("err");
  expect(fields).not.toHaveProperty("metadata");
}

describe("LiveSFUProvider", () => {
  const ORIGINAL_ENV = { ...process.env };
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.LIVEKIT_URL = "wss://test.livekit.cloud";
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret";
    // Import fresh, in the same post-resetModules "generation" the test body's
    // own `await import("./sfu-provider.livekit")` will land in — a logger
    // grabbed via a stale top-level import would be a DIFFERENT module
    // instance than the one sfu-provider.livekit.ts calls into after
    // `vi.resetModules()` (below) invalidates the registry between tests.
    const { logger } = await import("@/lib/shared");
    logError = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
    logError.mockRestore();
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

  describe("failure logging (each swallowed/rethrown error is now diagnosable)", () => {
    it("createRoom logs the failure but still returns the room (unchanged contract)", async () => {
      createRoom.mockRejectedValueOnce(new Error("boom"));
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      const room = await provider.createRoom("call-123");

      expect(room).toMatchObject({ roomId: "call-123" });
      expectLoggedFailure(logError, { roomId: "call-123" });
    });

    it("listParticipants logs the failure and still returns [] (unchanged contract)", async () => {
      listParticipants.mockRejectedValueOnce(new Error("boom"));
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.listParticipants("call-123")).resolves.toEqual([]);
      expectLoggedFailure(logError, { roomId: "call-123" });
    });

    it("getParticipant logs the failure (with identity) and still returns null (unchanged contract)", async () => {
      getParticipant.mockRejectedValueOnce(new Error("boom"));
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.getParticipant("call-123", "user-1")).resolves.toBeNull();
      expectLoggedFailure(logError, { roomId: "call-123", identity: "user-1" });
    });

    it("removeParticipant logs the failure and still rejects (unchanged contract)", async () => {
      removeParticipant.mockRejectedValueOnce(new Error("boom"));
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.removeParticipant("call-123", "user-1")).rejects.toThrow("boom");
      expectLoggedFailure(logError, { roomId: "call-123", identity: "user-1" });
    });

    it("muteTrack logs the failure (with trackSid) and still rejects (unchanged contract)", async () => {
      mutePublishedTrack.mockRejectedValueOnce(new Error("boom"));
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(
        provider.muteTrack("call-123", "user-1", "track-1", true),
      ).rejects.toThrow("boom");
      expectLoggedFailure(logError, { roomId: "call-123", identity: "user-1", trackSid: "track-1" });
    });

    it("deleteRoom logs the swallowed failure (unchanged contract: resolves undefined)", async () => {
      deleteRoom.mockRejectedValueOnce(new Error("boom"));
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.deleteRoom("call-123")).resolves.toBeUndefined();
      expectLoggedFailure(logError, { roomId: "call-123" });
    });

    it("muteParticipant logs the swallowed failure (unchanged contract: resolves undefined)", async () => {
      getParticipant.mockRejectedValueOnce(new Error("boom"));
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.muteParticipant("call-123", "user-1", true)).resolves.toBeUndefined();
      expectLoggedFailure(logError, { roomId: "call-123", identity: "user-1" });
    });

    it("muteAllParticipants logs the swallowed failure (unchanged contract: resolves undefined)", async () => {
      listParticipants.mockRejectedValueOnce(new Error("boom"));
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.muteAllParticipants("call-123", "host")).resolves.toBeUndefined();
      expectLoggedFailure(logError, { roomId: "call-123" });
    });
  });

  describe("not-configured invariant (getRoomServiceClient() null after live mode was selected)", () => {
    it("createRoom throws and logs instead of returning a room for a room that was never created", async () => {
      delete process.env.LIVEKIT_API_SECRET;
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.createRoom("call-123")).rejects.toThrow(/LiveKit not configured/);
      expect(createRoom).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(
        { roomId: "call-123" },
        expect.stringContaining("LiveKit room service unavailable"),
      );
    });

    it("listParticipants throws and logs instead of returning [] (an empty room and a dead LiveKit must not look the same)", async () => {
      delete process.env.LIVEKIT_API_SECRET;
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.listParticipants("call-123")).rejects.toThrow(/LiveKit not configured/);
      expect(listParticipants).not.toHaveBeenCalled();
    });

    it("removeParticipant throws and logs before ever attempting the operation", async () => {
      delete process.env.LIVEKIT_API_SECRET;
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.removeParticipant("call-123", "user-1")).rejects.toThrow(
        /LiveKit not configured/,
      );
      expect(removeParticipant).not.toHaveBeenCalled();
    });

    it("muteAllParticipants throws instead of silently no-op'ing — a host control must not lie about having worked", async () => {
      delete process.env.LIVEKIT_API_SECRET;
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await expect(provider.muteAllParticipants("call-123", "host")).rejects.toThrow(
        /LiveKit not configured/,
      );
      expect(listParticipants).not.toHaveBeenCalled();
    });
  });

  describe("secret-leak regression (Part B security constraint)", () => {
    it("never logs a planted secret from the error object, even if the SDK attaches one", async () => {
      // Shaped like livekit-server-sdk's real ServerError (status/code/metadata),
      // plus a planted secret on `.metadata` — the one field on that shape that
      // isn't read by `errorFields()`. If the logging code ever changed to spread
      // the whole error instead of naming fields, this is what would catch it.
      const serverErrorLike = Object.assign(new Error("Permission denied on room"), {
        status: 403,
        code: "permission_denied",
        metadata: { apiSecret: "LIVEKIT-API-SECRET-FAKE-VALUE", note: "echoed by a future SDK" },
      });
      listParticipants.mockRejectedValueOnce(serverErrorLike);
      const { LiveSFUProvider } = await import("./sfu-provider.livekit");
      const provider = new LiveSFUProvider();

      await provider.listParticipants("call-123");

      expect(logError).toHaveBeenCalledTimes(1);
      const [fields, msg] = logError.mock.calls[0]! as [Record<string, unknown>, string];
      expect(msg).toBe("LiveKit listParticipants failed");
      expect(fields).toMatchObject({
        errName: "Error",
        errMessage: "Permission denied on room",
        errCode: "permission_denied",
        errStatus: 403,
        roomId: "call-123",
      });

      const serialized = JSON.stringify(fields);
      expect(serialized).not.toContain("LIVEKIT-API-SECRET-FAKE-VALUE");
      expect(serialized).not.toContain("echoed by a future SDK");
      expect(fields).not.toHaveProperty("metadata");
      expect(fields).not.toHaveProperty("err");
    });
  });
});
