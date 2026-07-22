import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchActiveCall, type ActiveCallInfo } from "./call-state";

describe("call-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchActiveCall", () => {
    it("returns null when no active call exists", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ call: null }),
      });

      const result = await fetchActiveCall();
      expect(result).toBeNull();
    });

    it("returns ActiveCallInfo when user has an active call", async () => {
      const mockCall: ActiveCallInfo = {
        callId: "call-123",
        channelId: "ch-1",
        channelName: "general",
        type: "video",
        participantCount: 2,
        startedAt: new Date().toISOString(),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ call: mockCall }),
      });

      const result = await fetchActiveCall();
      expect(result).toEqual(mockCall);
    });

    it("returns null on fetch error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("network error"));

      const result = await fetchActiveCall();
      expect(result).toBeNull();
    });

    it("returns null when response is not ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await fetchActiveCall();
      expect(result).toBeNull();
    });
  });
});
