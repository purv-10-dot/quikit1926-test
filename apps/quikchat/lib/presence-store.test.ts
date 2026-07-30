import { describe, expect, it } from "vitest";
import {
  applyPresence,
  applySnapshot,
  applyStatus,
  emptyPresence,
  isOnline,
  isSetStatus,
  nextExpiry,
  onlineCount,
  statusOf,
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

describe("applySnapshot (rich `users` shape)", () => {
  it("seeds connectivity and durable set-status per user", () => {
    const s = applySnapshot(emptyPresence(), {
      users: [{ userId: "u1", status: "busy", statusMessage: "heads down" }, { userId: "u2" }],
    });
    expect([...s.online].sort()).toEqual(["u1", "u2"]);
    expect(statusOf(s, "u1")).toBe("busy");
    expect(statusOf(s, "u2")).toBe("online"); // online, no set-status
  });
});

describe("applyStatus", () => {
  it("records set-status independent of connectivity", () => {
    let s = applyStatus(emptyPresence(), { userId: "u1", status: "dnd" });
    // Not connected yet → offline wins regardless of the stored set-status.
    expect(statusOf(s, "u1")).toBe("offline");
    s = applyPresence(s, { userId: "u1", status: "online" });
    expect(statusOf(s, "u1")).toBe("dnd");
  });

  it("ignores an invalid status and returns the same reference when unchanged", () => {
    const s = applyStatus(emptyPresence(), { userId: "u1", status: "available" });
    expect(applyStatus(s, { userId: "u1", status: "available" })).toBe(s);
    expect(applyStatus(s, { userId: "u1", status: "bogus" as never })).toBe(s);
  });
});

describe("statusOf — effective-status precedence", () => {
  // offline > on_call > set-status > online
  it("offline wins over everything (no socket)", () => {
    const s = applyStatus(emptyPresence(), { userId: "u1", status: "busy" });
    expect(statusOf(s, "u1")).toBe("offline");
  });

  it("on_call wins over a manual set-status (DND)", () => {
    let s = applyStatus(emptyPresence(), { userId: "u1", status: "dnd" });
    s = applyPresence(s, { userId: "u1", status: "on_call" });
    expect(statusOf(s, "u1")).toBe("on_call");
  });

  it("set-status wins over plain online", () => {
    let s = applyPresence(emptyPresence(), { userId: "u1", status: "online" });
    s = applyStatus(s, { userId: "u1", status: "away" });
    expect(statusOf(s, "u1")).toBe("away");
  });

  it("online is the fallback when connected with no set-status", () => {
    const s = applyPresence(emptyPresence(), { userId: "u1", status: "online" });
    expect(statusOf(s, "u1")).toBe("online");
  });

  it("set-status is retained across offline and resurfaces on reconnect (via on_call revert)", () => {
    let s = applyStatus(emptyPresence(), { userId: "u1", status: "busy" });
    s = applyPresence(s, { userId: "u1", status: "on_call" });
    expect(statusOf(s, "u1")).toBe("on_call");
    // Call ends → gateway emits plain `online`; retained busy resurfaces.
    s = applyPresence(s, { userId: "u1", status: "online" });
    expect(statusOf(s, "u1")).toBe("busy");
  });
});

describe("isSetStatus (six statuses)", () => {
  it("accepts all six manual statuses and rejects derived/junk", () => {
    for (const v of ["available", "busy", "dnd", "brb", "away", "appear_offline"]) {
      expect(isSetStatus(v)).toBe(true);
    }
    for (const v of ["online", "offline", "on_call", "", "BUSY", 3, null, undefined]) {
      expect(isSetStatus(v)).toBe(false);
    }
  });
});

describe("statusOf — appear_offline", () => {
  it("masks to offline while connected (invisible to others)", () => {
    let s = applyPresence(emptyPresence(), { userId: "u1", status: "online" });
    s = applyStatus(s, { userId: "u1", status: "appear_offline" });
    expect(statusOf(s, "u1")).toBe("offline");
  });

  it("OUTRANKS on_call — a live call does not out an invisible user", () => {
    let s = applyStatus(emptyPresence(), { userId: "u1", status: "appear_offline" });
    s = applyPresence(s, { userId: "u1", status: "on_call" });
    expect(statusOf(s, "u1")).toBe("offline"); // privacy wins over on_call
  });

  it("a real disconnect still shows offline (unchanged)", () => {
    let s = applyPresence(emptyPresence(), { userId: "u1", status: "online" });
    s = applyStatus(s, { userId: "u1", status: "appear_offline" });
    s = applyPresence(s, { userId: "u1", status: "offline" });
    expect(statusOf(s, "u1")).toBe("offline");
  });
});

describe("statusOf — timed expiry (read-time)", () => {
  const T0 = 1_000_000_000_000;

  it("honours a set-status before its expiry, then falls through to online after", () => {
    const s = applyStatus(emptyPresence(), {
      userId: "u1",
      status: "busy",
      statusExpiresAt: new Date(T0 + 60_000).toISOString(),
    });
    // Needs a socket to be online at all.
    const conn = applyPresence(s, { userId: "u1", status: "online" });
    expect(statusOf(conn, "u1", T0 + 30_000)).toBe("busy"); // before deadline
    expect(statusOf(conn, "u1", T0 + 90_000)).toBe("online"); // after deadline
  });

  it("expired appear_offline stops masking (user becomes visible again)", () => {
    let s = applyPresence(emptyPresence(), { userId: "u1", status: "online" });
    s = applyStatus(s, {
      userId: "u1",
      status: "appear_offline",
      statusExpiresAt: new Date(T0 + 60_000).toISOString(),
    });
    expect(statusOf(s, "u1", T0 + 30_000)).toBe("offline"); // masking
    expect(statusOf(s, "u1", T0 + 90_000)).toBe("online"); // expired → visible
  });
});

describe("nextExpiry", () => {
  it("returns the earliest FUTURE expiry across users, or null", () => {
    const T0 = 2_000_000_000_000;
    let s = applyStatus(emptyPresence(), {
      userId: "u1",
      status: "busy",
      statusExpiresAt: new Date(T0 + 5_000).toISOString(),
    });
    s = applyStatus(s, {
      userId: "u2",
      status: "away",
      statusExpiresAt: new Date(T0 + 60_000).toISOString(),
    });
    s = applyStatus(s, { userId: "u3", status: "dnd" }); // no expiry
    expect(nextExpiry(s, T0)).toBe(T0 + 5_000);
    // Once the earliest is past, the next future one wins.
    expect(nextExpiry(s, T0 + 10_000)).toBe(T0 + 60_000);
    // All past → null.
    expect(nextExpiry(s, T0 + 999_999)).toBeNull();
  });
});
