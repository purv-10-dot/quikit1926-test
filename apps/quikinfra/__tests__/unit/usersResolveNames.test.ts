import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolate resolve-names from the DB layer entirely: stub the lookup it
// delegates to and assert the id→name Map construction + dedup/guard logic.
const findCnUsersByIds = vi.fn();
vi.mock("@/lib/users/lookup", () => ({
  findCnUsersByIds: (...a: unknown[]) => findCnUsersByIds(...a),
}));

import { resolveUserNames } from "@/lib/users/resolve-names";

beforeEach(() => findCnUsersByIds.mockReset());

describe("resolveUserNames", () => {
  it("returns an empty map without querying when no valid ids are passed", async () => {
    const map = await resolveUserNames([null, undefined, ""]);
    expect(map.size).toBe(0);
    expect(findCnUsersByIds).not.toHaveBeenCalled();
  });

  it("dedupes ids and filters out null/empty before the lookup", async () => {
    findCnUsersByIds.mockResolvedValue([]);
    await resolveUserNames(["u1", "u1", null, "u2", undefined, ""]);
    expect(findCnUsersByIds).toHaveBeenCalledWith(["u1", "u2"]);
  });

  it("builds an id→fullName map", async () => {
    findCnUsersByIds.mockResolvedValue([
      { id: "u1", email: "a@x.com", fullName: "Alice A" },
      { id: "u2", email: "b@x.com", fullName: "Bob B" },
    ]);
    const map = await resolveUserNames(["u1", "u2"]);
    expect(map.get("u1")).toBe("Alice A");
    expect(map.get("u2")).toBe("Bob B");
  });

  it("falls back to email then id when fullName is blank", async () => {
    findCnUsersByIds.mockResolvedValue([
      { id: "u1", email: "a@x.com", fullName: "" },
      { id: "u2", email: "", fullName: "" },
    ]);
    const map = await resolveUserNames(["u1", "u2"]);
    expect(map.get("u1")).toBe("a@x.com");
    expect(map.get("u2")).toBe("u2");
  });

  it("omits ids the lookup did not return (caller falls back to raw id)", async () => {
    findCnUsersByIds.mockResolvedValue([
      { id: "u1", email: "a@x.com", fullName: "Alice" },
    ]);
    const map = await resolveUserNames(["u1", "u-missing"]);
    expect(map.get("u1")).toBe("Alice");
    expect(map.has("u-missing")).toBe(false);
  });
});
