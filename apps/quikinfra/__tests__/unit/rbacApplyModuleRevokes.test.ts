import { describe, it, expect, vi } from "vitest";
import {
  applyModuleRevokes,
  modulesFromRevokes,
} from "@/lib/rbac/applyModuleRevokes";
import {
  ALL_MODULE_KEYS,
  MODULE_TO_RESOURCES,
  modulePermissionPairs,
} from "@/lib/rbac/permissionsRegistry";

// applyModuleRevokes takes the db as a plain argument (DbCentralLike), so we
// hand it a minimal stub instead of the global Prisma mock.
function makeDbStub() {
  return {
    cnUserPermissionExtra: {
      upsert: vi.fn(async (args: unknown) => args),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
}

// Modules that actually contribute resource/action pairs (organization &
// quality_safety map to resources NOT present in PERMISSION_TREE → 0 pairs).
const POPULATED_MODULES = ALL_MODULE_KEYS.filter(
  (m) => modulePermissionPairs(m).length > 0,
);

function pairCount(modules: string[]): number {
  return modules.reduce((n, m) => n + modulePermissionPairs(m).length, 0);
}

describe("applyModuleRevokes", () => {
  it("writes revoke=true upserts for every pair in UNticked modules", async () => {
    const db = makeDbStub();
    const ticked = ["purchase"];
    const res = await applyModuleRevokes(db, "u1", "org1", ticked, "actor1");

    const untickedPopulated = POPULATED_MODULES.filter((m) => m !== "purchase");
    expect(res.revokesWritten).toBe(pairCount(untickedPopulated));
    expect(res.revokesCleared).toBe(pairCount(["purchase"]));
    expect(db.cnUserPermissionExtra.upsert).toHaveBeenCalledTimes(
      res.revokesWritten + res.revokesCleared,
    );
  });

  it("reports the ticked list and unticked module count over ALL keys", async () => {
    const db = makeDbStub();
    const res = await applyModuleRevokes(db, "u1", "org1", ["purchase", "store"], null);
    expect(res.ticked.sort()).toEqual(["purchase", "store"].sort());
    expect(res.untickedModuleCount).toBe(ALL_MODULE_KEYS.length - 2);
  });

  it("ignores unknown module keys in the tick list", async () => {
    const db = makeDbStub();
    const res = await applyModuleRevokes(db, "u1", "org1", ["purchase", "bogus"], null);
    expect(res.ticked).toEqual(["purchase"]);
    expect(res.untickedModuleCount).toBe(ALL_MODULE_KEYS.length - 1);
  });

  it("ticking ALL modules clears every pair and writes zero revokes", async () => {
    const db = makeDbStub();
    const res = await applyModuleRevokes(db, "u1", "org1", [...ALL_MODULE_KEYS], "a");
    expect(res.revokesWritten).toBe(0);
    expect(res.revokesCleared).toBe(pairCount(POPULATED_MODULES));
  });

  it("ticking NOTHING revokes the whole populated universe", async () => {
    const db = makeDbStub();
    const res = await applyModuleRevokes(db, "u1", "org1", [], "a");
    expect(res.revokesCleared).toBe(0);
    expect(res.revokesWritten).toBe(pairCount(POPULATED_MODULES));
  });

  it("upsert payload carries orgId/userId/resource/action + grantedBy", async () => {
    const db = makeDbStub();
    await applyModuleRevokes(db, "user-X", "org-Y", ["purchase"], "actor-Z");
    const call = db.cnUserPermissionExtra.upsert.mock.calls[0][0] as any;
    expect(call.where.orgId_userId_resource_action.orgId).toBe("org-Y");
    expect(call.where.orgId_userId_resource_action.userId).toBe("user-X");
    expect(call.create.grantedBy).toBe("actor-Z");
    expect(typeof call.update.revoke).toBe("boolean");
  });
});

describe("modulesFromRevokes", () => {
  it("treats a module as ticked when none of its pairs are revoked", () => {
    const ticked = modulesFromRevokes([]);
    // empty revoke set → all populated modules are ticked
    expect(ticked.sort()).toEqual([...POPULATED_MODULES].sort());
  });

  it("keeps a module ticked when only SOME of its pairs are revoked", () => {
    // Revoking a single action must NOT drop the whole module — the user
    // still retains access to the rest of it. (Regression: a single unchecked
    // box used to clear the entire module on the Permissions page reload.)
    const poPair = MODULE_TO_RESOURCES["purchase"][0]; // construction.pr
    const ticked = modulesFromRevokes([{ resource: poPair, action: "view" }]);
    expect(ticked).toContain("purchase");
  });

  it("un-ticks a module only when EVERY one of its pairs is revoked", () => {
    const allPurchasePairs = modulePermissionPairs("purchase").map((p) => ({
      resource: p.resource,
      action: p.action,
    }));
    const ticked = modulesFromRevokes(allPurchasePairs);
    expect(ticked).not.toContain("purchase");
  });

  it("includes organization & quality_safety — their resources DO exist in the tree", () => {
    // Despite the docstring, only modules with an empty MODULE_TO_RESOURCES
    // list are skipped; organization/quality_safety each map to a real
    // construction.* resource, so they surface as ticked when unrevoked.
    const ticked = modulesFromRevokes([]);
    expect(ticked).toContain("organization");
    expect(ticked).toContain("quality_safety");
  });

  it("ignores revokes for resources outside the module universe", () => {
    const ticked = modulesFromRevokes([
      { resource: "construction.settings", action: "manage" },
    ]);
    expect(ticked.sort()).toEqual([...POPULATED_MODULES].sort());
  });
});
