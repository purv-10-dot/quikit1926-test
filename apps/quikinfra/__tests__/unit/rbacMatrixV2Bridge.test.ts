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

// Per-page split (Phase 4): every MASTERS page now owns its OWN resource, so
// pages are independently grant/revoke-able. Unchecking one page revokes only
// that page's resource and never touches its neighbours.
describe("per-page masters resources", () => {
  it("each masters page maps to its own resource (Labour/Workmen included)", () => {
    expect(MENU_TO_RESOURCE["master.vendor"]).toBe("construction.master_vendor");
    expect(MENU_TO_RESOURCE["master.item"]).toBe("construction.master_item");
    expect(MENU_TO_RESOURCE["master.labour"]).toBe("construction.master_labour");
    expect(MENU_TO_RESOURCE["master.workman"]).toBe("construction.master_workman");
    // Projects keeps its own resource; not part of the masters cluster.
    expect(MENU_TO_RESOURCE["master.project"]).toBe("construction.project");
  });

  it("organization pages map to their own construction.org_* resources", () => {
    expect(MENU_TO_RESOURCE["org.company"]).toBe("construction.org_company");
    expect(MENU_TO_RESOURCE["org.gst"]).toBe("construction.org_gst");
    expect(MENU_TO_RESOURCE["org.terms"]).toBe("construction.org_terms");
  });

  it("a masters page is now its OWN only sibling (independent)", () => {
    expect(siblingMenuKeys("master.vendor")).toEqual(["master.vendor"]);
    expect(siblingMenuKeys("master.labour")).toEqual(["master.labour"]);
  });

  it("an unbridged key is its own only sibling", () => {
    expect(siblingMenuKeys("totally.unknown")).toEqual(["totally.unknown"]);
  });

  it("unchecking ONE masters page revokes ONLY that page, not its neighbours", () => {
    const matrix: PermissionMatrix = {
      "master.vendor":     { add: false, edit: false, delete: false, view: false },
      "master.item":       { add: true,  edit: true,  delete: true,  view: true },
      "master.contractor": { add: true,  edit: true,  delete: true,  view: true },
    };
    const revokes = matrixToRevokes(matrix);
    // Vendor's own resource is revoked…
    expect(revokes).toContainEqual({ resource: "construction.master_vendor", action: "view" });
    expect(revokes).toContainEqual({ resource: "construction.master_vendor", action: "create" });
    expect(revokes).toContainEqual({ resource: "construction.master_vendor", action: "edit" });
    expect(revokes).toContainEqual({ resource: "construction.master_vendor", action: "delete" });
    // …and Items / Contractors are left completely untouched.
    expect(revokes.some((r) => r.resource === "construction.master_item")).toBe(false);
    expect(revokes.some((r) => r.resource === "construction.master_contractor")).toBe(false);
  });

  it("unchecking one page persists (round-trips false) without affecting others", () => {
    const matrix: PermissionMatrix = {
      "master.vendor": { add: false, edit: false, delete: false, view: false },
      "master.item":   { add: true,  edit: true,  delete: true,  view: true },
    };
    const rebuilt = revokesToMatrix(matrixToRevokes(matrix));
    expect(rebuilt["master.vendor"]).toEqual({
      add: false, edit: false, delete: false, view: false,
    });
    // Items stays fully granted.
    expect(rebuilt["master.item"]).toEqual({
      add: true, edit: true, delete: true, view: true,
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

  it("includes extra actions like construction.master_item import/export", () => {
    const pairs = managedPairs();
    expect(pairs).toContainEqual({ resource: "construction.master_item", action: "import" });
    expect(pairs).toContainEqual({ resource: "construction.master_item", action: "export" });
    // Settings-tier `manage` is never matrix-managed.
    expect(pairs).not.toContainEqual({ resource: "construction.workflows", action: "manage" });
  });
});
