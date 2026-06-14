import { describe, it, expect, vi } from "vitest";
import {
  applyProjectAccess,
  loadProjectAccess,
} from "@/lib/rbac/applyProjectAccess";

// applyProjectAccess takes db as a plain DbCentralLike argument.
function makeDbStub(current: string[] = []) {
  return {
    cnUserProjectAccess: {
      findMany: vi.fn(async () => current.map((projectId) => ({ projectId }))),
      createMany: vi.fn(async (args: any) => ({ count: args.data.length })),
      deleteMany: vi.fn(async (args: any) => ({
        count: args.where.projectId.in.length,
      })),
    },
  };
}

describe("applyProjectAccess", () => {
  it("grants the projects that are desired but not yet present", async () => {
    const db = makeDbStub(["p1"]);
    const res = await applyProjectAccess(db, "u1", "org1", ["p1", "p2", "p3"], "actor");
    expect(res.granted).toBe(2);
    expect(res.revoked).toBe(0);
    const createArg = db.cnUserProjectAccess.createMany.mock.calls[0][0] as any;
    expect(createArg.data.map((d: any) => d.projectId).sort()).toEqual(["p2", "p3"]);
    expect(createArg.skipDuplicates).toBe(true);
    expect(createArg.data[0].grantedBy).toBe("actor");
  });

  it("revokes projects present but no longer desired", async () => {
    const db = makeDbStub(["p1", "p2", "p3"]);
    const res = await applyProjectAccess(db, "u1", "org1", ["p1"], null);
    expect(res.granted).toBe(0);
    expect(res.revoked).toBe(2);
    const delArg = db.cnUserProjectAccess.deleteMany.mock.calls[0][0] as any;
    expect(delArg.where.projectId.in.sort()).toEqual(["p2", "p3"]);
  });

  it("grants AND revokes in a single reconcile when both diverge", async () => {
    const db = makeDbStub(["p1", "p2"]);
    const res = await applyProjectAccess(db, "u1", "org1", ["p2", "p3"], "a");
    expect(res.granted).toBe(1); // p3
    expect(res.revoked).toBe(1); // p1
  });

  it("is a no-op when desired equals current", async () => {
    const db = makeDbStub(["p1", "p2"]);
    const res = await applyProjectAccess(db, "u1", "org1", ["p2", "p1"], "a");
    expect(res.granted).toBe(0);
    expect(res.revoked).toBe(0);
    expect(db.cnUserProjectAccess.createMany).not.toHaveBeenCalled();
    expect(db.cnUserProjectAccess.deleteMany).not.toHaveBeenCalled();
  });

  it("dedupes and drops empty/non-string ids from the desired list", async () => {
    const db = makeDbStub([]);
    const res = await applyProjectAccess(
      db,
      "u1",
      "org1",
      ["p1", "p1", "", "p2", null as any, undefined as any, 5 as any],
      "a",
    );
    expect(res.desired.sort()).toEqual(["p1", "p2"]);
    expect(res.granted).toBe(2);
  });

  it("revokes everything when desired is empty", async () => {
    const db = makeDbStub(["p1", "p2"]);
    const res = await applyProjectAccess(db, "u1", "org1", [], "a");
    expect(res.desired).toEqual([]);
    expect(res.revoked).toBe(2);
    expect(res.granted).toBe(0);
  });
});

describe("loadProjectAccess", () => {
  it("returns the project IDs for the user in the org", async () => {
    const db = makeDbStub(["p1", "p2"]);
    const ids = await loadProjectAccess(db, "u1", "org1");
    expect(ids.sort()).toEqual(["p1", "p2"]);
    const arg = (db.cnUserProjectAccess.findMany.mock.calls as any)[0][0] as any;
    expect(arg.where).toEqual({ userId: "u1", orgId: "org1" });
  });

  it("returns [] when the user has no access rows", async () => {
    const db = makeDbStub([]);
    expect(await loadProjectAccess(db, "u1", "org1")).toEqual([]);
  });
});
