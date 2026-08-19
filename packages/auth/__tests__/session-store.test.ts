import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Redis-backed auth session lifecycle used by every QuikIT app (quikscale,
 * quikflow, …) on login/logout: createAuthSession on sign-in, revokeAuthSession
 * on sign-out, isAuthSessionActive on every protected nav.
 *
 * Key contract under test: key naming (`auth:session:<id>`), TTL, and the
 * fail-open behaviour when Redis is unavailable — login/nav must never hard-fail
 * because the session store is down.
 */

const mockRedis = {
  set: vi.fn(async () => "OK"),
  expire: vi.fn(async () => 1),
  exists: vi.fn(async () => 1),
  del: vi.fn(async () => 1),
};

vi.mock("@quikit/redis", () => ({
  getRedis: vi.fn(() => mockRedis),
}));

vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return { ...actual, randomUUID: vi.fn(() => "fixed-session-id") };
});

import { getRedis } from "@quikit/redis";
import {
  createAuthSession,
  touchAuthSession,
  isAuthSessionActive,
  revokeAuthSession,
} from "../session-store";

describe("session-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.exists.mockResolvedValue(1);
    mockRedis.del.mockResolvedValue(1);
    vi.mocked(getRedis).mockReturnValue(mockRedis as any);
  });

  describe("createAuthSession", () => {
    it("writes auth:session:<id> with userId/createdAt and the given TTL", async () => {
      const sessionId = await createAuthSession("user-1", 30 * 24 * 60 * 60);

      expect(sessionId).toBe("fixed-session-id");
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      const [key, payload, mode, ttl] = mockRedis.set.mock.calls[0];
      expect(key).toBe("auth:session:fixed-session-id");
      expect(JSON.parse(payload)).toMatchObject({ userId: "user-1" });
      expect(mode).toBe("EX");
      expect(ttl).toBe(30 * 24 * 60 * 60);
    });

    it("still returns a usable session id when Redis is unavailable (fail-open)", async () => {
      vi.mocked(getRedis).mockReturnValue(null as any);
      const sessionId = await createAuthSession("user-1", 3600);
      expect(sessionId).toBe("fixed-session-id");
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it("still returns a session id when the Redis SET call throws", async () => {
      mockRedis.set.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const sessionId = await createAuthSession("user-1", 3600);
      expect(sessionId).toBe("fixed-session-id");
    });
  });

  describe("isAuthSessionActive", () => {
    it("returns true when the Redis key exists", async () => {
      mockRedis.exists.mockResolvedValueOnce(1);
      await expect(isAuthSessionActive("fixed-session-id")).resolves.toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith("auth:session:fixed-session-id");
    });

    it("returns false once the key has been revoked/expired", async () => {
      mockRedis.exists.mockResolvedValueOnce(0);
      await expect(isAuthSessionActive("fixed-session-id")).resolves.toBe(false);
    });

    it("fails open (true) when Redis is unavailable", async () => {
      vi.mocked(getRedis).mockReturnValue(null as any);
      await expect(isAuthSessionActive("fixed-session-id")).resolves.toBe(true);
    });

    it("fails open (true) when the Redis EXISTS call throws", async () => {
      mockRedis.exists.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      await expect(isAuthSessionActive("fixed-session-id")).resolves.toBe(true);
    });
  });

  describe("touchAuthSession", () => {
    it("refreshes the key's TTL", async () => {
      await touchAuthSession("fixed-session-id", 3600);
      expect(mockRedis.expire).toHaveBeenCalledWith("auth:session:fixed-session-id", 3600);
    });

    it("no-ops when Redis is unavailable", async () => {
      vi.mocked(getRedis).mockReturnValue(null as any);
      await touchAuthSession("fixed-session-id", 3600);
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  describe("revokeAuthSession — logout", () => {
    it("deletes the Redis session key so the JWT can no longer soft-validate", async () => {
      await revokeAuthSession("fixed-session-id");
      expect(mockRedis.del).toHaveBeenCalledWith("auth:session:fixed-session-id");
    });

    it("a session is reported inactive immediately after being revoked", async () => {
      await revokeAuthSession("fixed-session-id");
      mockRedis.exists.mockResolvedValueOnce(0); // simulate the DEL having taken effect
      await expect(isAuthSessionActive("fixed-session-id")).resolves.toBe(false);
    });

    it("no-ops when Redis is unavailable (logout must not throw)", async () => {
      vi.mocked(getRedis).mockReturnValue(null as any);
      await expect(revokeAuthSession("fixed-session-id")).resolves.toBeUndefined();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it("does not throw when the Redis DEL call errors", async () => {
      mockRedis.del.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      await expect(revokeAuthSession("fixed-session-id")).resolves.toBeUndefined();
    });
  });
});
