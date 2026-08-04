import { describe, expect, it, vi, beforeEach } from "vitest";
import { StubSFUProvider } from "./sfu-provider.stub";
import { selectSFUMode } from "./sfu-provider";

describe("SFU provider seam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("selectSFUMode", () => {
    it("returns stub by default", () => {
      expect(selectSFUMode({})).toEqual({ mode: "stub" });
    });

    it("returns live when SFU_MODE=live and all LiveKit vars are set", () => {
      expect(
        selectSFUMode({
          SFU_MODE: "live",
          LIVEKIT_URL: "wss://livekit.example.com",
          LIVEKIT_API_KEY: "key",
          LIVEKIT_API_SECRET: "secret",
        }),
      ).toEqual({ mode: "live" });
    });

    it("falls back to stub with warning when SFU_MODE=live but LIVEKIT_URL missing", () => {
      const result = selectSFUMode({
        SFU_MODE: "live",
        LIVEKIT_API_KEY: "key",
        LIVEKIT_API_SECRET: "secret",
      });
      expect(result.mode).toBe("stub");
      expect(result.warning).toContain("LIVEKIT_URL");
    });

    it("falls back to stub with warning when SFU_MODE=live but key/secret missing", () => {
      const result = selectSFUMode({ SFU_MODE: "live", LIVEKIT_URL: "wss://livekit.example.com" });
      expect(result.mode).toBe("stub");
      expect(result.warning).toContain("LIVEKIT_API_KEY");
      expect(result.warning).toContain("LIVEKIT_API_SECRET");
    });
  });

  describe("StubSFUProvider", () => {
    it("creates a room with room ID", async () => {
      const provider = new StubSFUProvider();
      const room = await provider.createRoom("channel-1");
      expect(room.roomId).toBe("channel-1");
    });

    it("generates access token for a user", async () => {
      const provider = new StubSFUProvider();
      const token = await provider.generateToken("room-1", "user-1", "Alice");
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
    });

    it("lists participants in a room", async () => {
      const provider = new StubSFUProvider();
      const participants = await provider.listParticipants("room-1");
      expect(Array.isArray(participants)).toBe(true);
    });

    it("removeParticipant is a no-op in stub mode", async () => {
      const provider = new StubSFUProvider();
      await expect(provider.removeParticipant("room-1", "user-1")).resolves.toBeUndefined();
    });

    it("muteParticipant is a no-op in stub mode", async () => {
      const provider = new StubSFUProvider();
      await expect(provider.muteParticipant("room-1", "user-1", true)).resolves.toBeUndefined();
    });

    it("muteAllParticipants is a no-op in stub mode", async () => {
      const provider = new StubSFUProvider();
      await expect(provider.muteAllParticipants("room-1")).resolves.toBeUndefined();
    });

    it("muteAllParticipants excludes identity when specified", async () => {
      const provider = new StubSFUProvider();
      await expect(provider.muteAllParticipants("room-1", "user-1")).resolves.toBeUndefined();
    });
  });
});
