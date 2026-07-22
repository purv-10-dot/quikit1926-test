import { describe, expect, it } from "vitest";
import {
  applyPresence,
  applySnapshot,
  emptyPresence,
  isOnline,
  onlineCount,
} from "./presence-store";

describe("applySnapshot", () => {
  it("replaces the online set and preserves lastSeen", () => {
    const seeded = applyPresence(emptyPresence(), {
      userId: "u9",
      status: "offline",
      lastSeen: "t",
    });
    const s = applySnapshot(seeded, { userIds: ["u1", "u2"] });
    expect([...s.online].sort()).toEqual(["u1", "u2"]);
    expect(s.lastSeen.u9).toBe("t");
  });

  it("tolerates a missing userIds array", () => {
    const s = applySnapshot(emptyPresence(), {} as never);
    expect(s.online.size).toBe(0);
  });
});

describe("applyPresence", () => {
  it("adds a user on `online` and clears any stale lastSeen", () => {
    let s = applyPresence(emptyPresence(), { userId: "u1", status: "offline", lastSeen: "t" });
    s = applyPresence(s, { userId: "u1", status: "online" });
    expect(isOnline(s, "u1")).toBe(true);
    expect(s.lastSeen.u1).toBeUndefined();
  });

  it("removes a user on `offline` and records lastSeen", () => {
    let s = applySnapshot(emptyPresence(), { userIds: ["u1"] });
    s = applyPresence(s, { userId: "u1", status: "offline", lastSeen: "2026-01-01T00:00:00Z" });
    expect(isOnline(s, "u1")).toBe(false);
    expect(s.lastSeen.u1).toBe("2026-01-01T00:00:00Z");
  });

  it("returns the same reference when nothing changes", () => {
    const s = applySnapshot(emptyPresence(), { userIds: ["u1"] });
    expect(applyPresence(s, { userId: "u1", status: "online" })).toBe(s);
    const empty = emptyPresence();
    expect(applyPresence(empty, { userId: "ghost", status: "offline" })).toBe(empty);
  });

  it("ignores an event without a userId", () => {
    const s = emptyPresence();
    expect(applyPresence(s, { userId: "", status: "online" })).toBe(s);
  });
});

describe("onlineCount", () => {
  it("counts only the given users that are online", () => {
    const s = applySnapshot(emptyPresence(), { userIds: ["u1", "u2", "u3"] });
    expect(onlineCount(s, ["u1", "u3", "u9"])).toBe(2);
  });
});
