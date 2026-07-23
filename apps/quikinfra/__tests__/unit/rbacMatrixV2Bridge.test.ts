import { describe, it, expect } from "vitest";
import {
  matrixToRevokes,
  revokesToMatrix,
  managedPairs,
  siblingMenuKeys,
  MENU_TO_RESOURCE,
  type PermissionMatrix,
} from "@/lib/rbac/matrixV2Bridge";

describe("matrixToRevokes", () => {
  it("returns [] for null/undefined/empty", () => {
    expect(matrixToRevokes(null)).toEqual([]);
    expect(matrixToRevokes(undefined)).toEqual([]);
    expect(matrixToRevokes({})).toEqual([]);
  });

  it("only emits cells explicitly set to false (true / absent → no revoke)", () => {
    const matrix: PermissionMatrix = {
      "purchase.po": { add: false, edit: true, view: false },
    };
    const out = matrixToRevokes(matrix);
    // purchase.po → construction.po; add→create
    expect(out).toContainEqual({ resource: "construction.po", action: "create" });
    expect(out).toContainEqual({ resource: "construction.po", action: "view" });
    // edit: true must NOT produce a revoke
    expect(out).not.toContainEqual({ resource: "construction.po", action: "edit" });
    expect(out.length).toBe(2);
  });

  it("renames the matrix `add` action to the v2 `create` action", () => {
    const out = matrixToRevokes({ "purchase.po": { add: false } });
    expect(out).toEqual([{ resource: "construction.po", action: "create" }]);
  });

  it("skips menu keys not present in MENU_TO_RESOURCE", () => {
    const out = matrixToRevokes({ "totally.unknown": { view: false } });
    expect(out).toEqual([]);
  });

  // Regression: Gantt View (read-only, add/edit/delete=false) shares the
  // construction.dpr resource with DPR. Its forced-false add/edit/delete
  // cells must NOT emit revokes, or they strip DPR's create/edit/delete.
  it("does not revoke unsupported actions of a read-only page (Gantt → DPR)", () => {
    const matrix: PermissionMatrix = {
      "pm.dpr":   { add: true,  edit: true,  delete: true,  view: true },
      "pm.gantt": { add: false, edit: false, delete: false, view: true },
    };
    const out = matrixToRevokes(matrix);
    // Gantt's read-only add/edit/delete must not touch construction.dpr.
    expect(out).not.toContainEqual({ resource: "construction.dpr", action: "create" });
    expect(out).not.toContainEqual({ resource: "construction.dpr", action: "edit" });
    expect(out).not.toContainEqual({ resource: "construction.dpr", action: "delete" });
    expect(out).toEqual([]);
  });

  // Hindrance Register now owns construction.hindrance, so unchecking it
  // revokes ITS OWN resource and never touches DPR — the definitive fix for
  // the "check DPR, save, reopen → cleared again" production bug.
  it("unchecking Hindrance revokes construction.hindrance, never construction.dpr", () => {
    const matrix: PermissionMatrix = {
      "pm.dpr":       { add: true,  edit: true,  delete: true,  view: true },
      "pm.gantt":     { add: false, edit: false, delete: false, view: true },
      "pm.hindrance": { add: false, edit: false, delete: false, view: false },
    };
    const out = matrixToRevokes(matrix);
    // DPR keeps everything — it no longer shares a resource with its neighbours.
    expect(out).not.toContainEqual({ resource: "construction.dpr", action: "create" });
    expect(out).not.toContainEqual({ resource: "construction.dpr", action: "edit" });
    expect(out).not.toContainEqual({ resource: "construction.dpr", action: "delete" });
    expect(out).not.toContainEqual({ resource: "construction.dpr", action: "view" });
    // Hindrance's own resource is revoked for the cells the admin unchecked.
    expect(out).toContainEqual({ resource: "construction.hindrance", action: "create" });
    expect(out).toContainEqual({ resource: "construction.hindrance", action: "view" });
    // Gantt is read-only → its forced-false add/edit/delete emit nothing.
    expect(out).not.toContainEqual({ resource: "construction.gantt", action: "create" });
  });
});

describe("revokesToMatrix", () => {
  it("an empty revoke set yields an all-true matrix for every bridged menu", () => {
    const matrix = revokesToMatrix([]);
    for (const [key, row] of Object.entries(matrix)) {
      expect(MENU_TO_RESOURCE[key]).toBeDefined();
      expect(row).toEqual({ add: true, edit: true, delete: true, view: true });
    }
    expect(Object.keys(matrix).length).toBeGreaterThan(0);
  });

  it("sets only the revoked cells to false, leaving the rest true", () => {
    const matrix = revokesToMatrix([{ resource: "construction.po", action: "create" }]);
    // purchase.po maps to construction.po; create ↔ add
    expect(matrix["purchase.po"]).toEqual({
      add: false, // create revoked
      edit: true,
      delete: true,
      view: true,
    });
  });
});

describe("round-trip: matrixToRevokes → revokesToMatrix", () => {
  it("recovers the false cells of a single-resource matrix", () => {
    // Build a deny on purchase.po add + view, allow the rest.
    const original: PermissionMatrix = {
      "purchase.po": { add: false, edit: true, delete: true, view: false },
    };
    const revokes = matrixToRevokes(original);
    const rebuilt = revokesToMatrix(revokes);
    // The rebuilt matrix covers ALL bridged menus; the po row must match intent.
    expect(rebuilt["purchase.po"]).toEqual({
      add: false,
      edit: true,
      delete: true,
      view: false,
    });
  });

  it("round-trips to an all-allow matrix when nothing was denied", () => {
    const revokes = matrixToRevokes({ "purchase.po": { add: true, view: true } });
    expect(revokes).toEqual([]);
    const rebuilt = revokesToMatrix(revokes);
    expect(rebuilt["purchase.po"]).toEqual({
      add: true, edit: true, delete: true, view: true,
    });
  });
});

// Regression: shared-resource pages (every MASTERS page → construction.masters)
// could not be unchecked individually. Unchecking one page left its siblings
// granted, so matrixToRevokes wrote NO revoke and the cell reverted to checked
// on reload. The UI now toggles the whole cluster together (siblingMenuKeys);
// these tests pin the bridge behaviour that fix relies on.
describe("shared-resource clusters (masters)", () => {
  it("siblingMenuKeys groups every masters page, incl. Labour + Workmen", () => {
    const sibs = siblingMenuKeys("master.vendor");
    // Vendors shares construction.masters with the other operational masters.
    expect(sibs).toContain("master.item");
    expect(sibs).toContain("master.contractor");
    expect(sibs).toContain("master.asset");
    // Newly bridged rows — previously unmanaged, always reverted.
    expect(sibs).toContain("master.labour");
    expect(sibs).toContain("master.workman");
    // Projects has its OWN resource — must NOT be pulled into the cluster.
    expect(sibs).not.toContain("master.project");
  });

  it("Labour + Workmen are now bridged to construction.masters", () => {
    expect(MENU_TO_RESOURCE["master.labour"]).toBe("construction.masters");
    expect(MENU_TO_RESOURCE["master.workman"]).toBe("construction.masters");
  });

  it("an unbridged key is its own only sibling", () => {
    expect(siblingMenuKeys("totally.unknown")).toEqual(["totally.unknown"]);
  });

  it("unchecking ONE masters page while siblings stay checked writes no revoke", () => {
    // The old bug: only Vendors unchecked → construction.masters still granted
    // via the other pages → no revoke → reverts on reload.
    const matrix: PermissionMatrix = {
      "master.vendor":     { add: false, edit: false, delete: false, view: false },
      "master.item":       { add: true,  edit: true,  delete: true,  view: true },
      "master.contractor": { add: true,  edit: true,  delete: true,  view: true },
    };
    expect(matrixToRevokes(matrix)).toEqual([]);
  });

  it("unchecking the WHOLE masters cluster persists (round-trips false)", () => {
    // What the lockstep toggle produces: every masters page denied together.
    const masters = siblingMenuKeys("master.vendor");
    const matrix: PermissionMatrix = {};
    for (const k of masters) {
      matrix[k] = { add: false, edit: false, delete: false, view: false };
    }
    const revokes = matrixToRevokes(matrix);
    // The shared resource is now revoked for every supported action.
    expect(revokes).toContainEqual({ resource: "construction.masters", action: "view" });
    expect(revokes).toContainEqual({ resource: "construction.masters", action: "create" });
    expect(revokes).toContainEqual({ resource: "construction.masters", action: "edit" });
    expect(revokes).toContainEqual({ resource: "construction.masters", action: "delete" });
    // …and it round-trips back to unchecked instead of reverting to checked.
    const rebuilt = revokesToMatrix(revokes);
    expect(rebuilt["master.vendor"]).toEqual({
      add: false, edit: false, delete: false, view: false,
    });
    expect(rebuilt["master.labour"]).toEqual({
      add: false, edit: false, delete: false, view: false,
    });
  });
});

describe("managedPairs", () => {
  it("returns deduped (resource, action) pairs — no duplicates", () => {
    const pairs = managedPairs();
    const keys = pairs.map((p) => `${p.resource}:${p.action}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("every pair uses a managed action and a resource present in MENU_TO_RESOURCE values", () => {
    const resources = new Set(Object.values(MENU_TO_RESOURCE));
    // The matrix now manages the FULL action set per resource, not just the
    // 4 columns — extra actions (import/export/approve/reverse/lock/receive)
    // are revoked/granted alongside them. `manage` (settings tier) is excluded.
    const managedActions = new Set([
      "view", "create", "edit", "delete",
      "import", "export", "approve", "reverse", "lock", "receive",
    ]);
    for (const p of managedPairs()) {
      expect(resources.has(p.resource)).toBe(true);
      expect(managedActions.has(p.action)).toBe(true);
    }
  });

  it("includes extra actions like construction.masters import/export", () => {
    const pairs = managedPairs();
    expect(pairs).toContainEqual({ resource: "construction.masters", action: "import" });
    expect(pairs).toContainEqual({ resource: "construction.masters", action: "export" });
    // Settings-tier `manage` is never matrix-managed.
    expect(pairs).not.toContainEqual({ resource: "construction.workflows", action: "manage" });
  });
});
