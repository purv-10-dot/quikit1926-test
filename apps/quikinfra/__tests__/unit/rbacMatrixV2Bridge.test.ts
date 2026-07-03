import { describe, it, expect } from "vitest";
import {
  matrixToRevokes,
  revokesToMatrix,
  managedPairs,
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

describe("managedPairs", () => {
  it("returns deduped (resource, action) pairs — no duplicates", () => {
    const pairs = managedPairs();
    const keys = pairs.map((p) => `${p.resource}:${p.action}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("every pair uses a v2 action and a resource present in MENU_TO_RESOURCE values", () => {
    const resources = new Set(Object.values(MENU_TO_RESOURCE));
    const v2Actions = new Set(["view", "create", "edit", "delete"]);
    for (const p of managedPairs()) {
      expect(resources.has(p.resource)).toBe(true);
      expect(v2Actions.has(p.action)).toBe(true);
    }
  });
});
