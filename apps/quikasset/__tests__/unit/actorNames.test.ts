import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { resolveActorNames } from "@/lib/api/actorNames";

describe("resolveActorNames", () => {
  beforeEach(() => resetMockDb());

  it("returns an empty map and issues NO query when there are no usable ids", async () => {
    const map = await resolveActorNames([null, undefined, ""]);
    expect(map.size).toBe(0);
    expect(mockDb.user.findMany).not.toHaveBeenCalled();
  });

  it("dedupes ids and looks them up in one batched query", async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", firstName: "Ada", lastName: "Admin", email: "ada@x.com" },
    ] as never);

    await resolveActorNames(["u1", "u1", null, "u1"]);

    const call = mockDb.user.findMany.mock.calls[0]?.[0] as { where: { id: { in: string[] } } };
    expect(call.where.id.in).toEqual(["u1"]); // deduped, falsy dropped
  });

  it("composes firstName + lastName, keyed by id", async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", firstName: "Ada", lastName: "Admin", email: "ada@x.com" },
      { id: "u2", firstName: "Grace", lastName: "Hopper", email: "grace@x.com" },
    ] as never);

    const map = await resolveActorNames(["u1", "u2"]);
    expect(map.get("u1")).toBe("Ada Admin");
    expect(map.get("u2")).toBe("Grace Hopper");
  });

  it("falls back to email when the name parts are blank", async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: "u3", firstName: "", lastName: "", email: "only@x.com" },
    ] as never);

    const map = await resolveActorNames(["u3"]);
    expect(map.get("u3")).toBe("only@x.com");
  });

  it("omits a user with neither name nor email (map miss → caller falls back to null)", async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: "u4", firstName: null, lastName: null, email: null },
    ] as never);

    const map = await resolveActorNames(["u4"]);
    expect(map.has("u4")).toBe(false);
  });
});
