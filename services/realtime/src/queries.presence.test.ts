import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@quikit/database", async () => await import("./testdb"));

import { getPresenceStatus, getPresenceStatuses } from "./queries";
import { addPresence, FIXTURES, resetStore } from "./testdb";

const { orgA, alice, bob } = FIXTURES;

beforeEach(() => resetStore());
afterEach(() => resetStore());

describe("getPresenceStatuses — read-time expiry (gateway is write-free)", () => {
  it("returns a live set-status with its expiry (ISO)", async () => {
    const future = new Date(Date.now() + 60_000);
    addPresence({ orgId: orgA, userId: alice, status: "busy", statusMessage: "x", statusExpiresAt: future });
    const m = await getPresenceStatuses(orgA, [alice]);
    expect(m.get(alice)).toEqual({
      status: "busy",
      statusMessage: "x",
      statusExpiresAt: future.toISOString(),
    });
  });

  it("treats a lapsed timed status as available — resolved on READ, never written", async () => {
    addPresence({
      orgId: orgA,
      userId: bob,
      status: "dnd",
      statusMessage: "x",
      statusExpiresAt: new Date(Date.now() - 1_000), // already past
    });
    const m = await getPresenceStatuses(orgA, [bob]);
    expect(m.get(bob)).toEqual({ status: "available", statusMessage: null, statusExpiresAt: null });
  });
});

describe("getPresenceStatus — single-user read-time expiry", () => {
  it("resolves a lapsed status to available", async () => {
    addPresence({
      orgId: orgA,
      userId: alice,
      status: "away",
      statusMessage: null,
      statusExpiresAt: new Date(Date.now() - 1),
    });
    expect(await getPresenceStatus(orgA, alice)).toEqual({
      status: "available",
      statusMessage: null,
      statusExpiresAt: null,
    });
  });

  it("returns null when the user has no row", async () => {
    expect(await getPresenceStatus(orgA, alice)).toBeNull();
  });
});
