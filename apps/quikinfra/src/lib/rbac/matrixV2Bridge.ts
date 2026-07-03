/**
 * Permission-matrix ↔ v2 bridge (Item 6).
 *
 * The legacy `cn_users.permissionMatrix` stored per-menu Add/Edit/Delete/View
 * deny-overrides as a JSON blob. v2 stores the same intent as
 * `CnUserPermissionExtra` rows with `revoke: true`.
 *
 * This file moves data both directions:
 *
 *   matrixToRevokes(matrix)        — JSON shape → list of revoke rows to write
 *   revokesToMatrix(revokes)       — list of revoke rows → JSON shape for the UI
 *
 * The Permissions admin page keeps using the JSON shape; the API layer
 * translates on the way in and on the way out. Frontend untouched.
 */

import { MENU_CATALOG } from "./menu-catalog";

/**
 * Menu key → which of add/edit/delete/view the page actually supports.
 * Read-only pages (Gantt View, Stock Register, Reports) have
 * add/edit/delete = false. Their unchecked add/edit/delete cells are UI
 * artifacts, not real denials — see `matrixToRevokes`.
 */
const MENU_SUPPORTS: Readonly<
  Record<string, { add: boolean; edit: boolean; delete: boolean; view: boolean }>
> = Object.fromEntries(MENU_CATALOG.map((m) => [m.key, m.supports]));

/**
 * Menu key → v2 resource. Mirrors MENU_CATALOG ordering. Keys not listed
 * here are silently skipped during translation (they're "unmanaged" by
 * the matrix-to-v2 bridge — could be new menus added after this file
 * was last updated).
 */
export const MENU_TO_RESOURCE: Readonly<Record<string, string>> = {
  // Organization (Departments / Banks / FYs / Cost Centers / Companies setup)
  "org.company":       "construction.organization",
  "org.department":    "construction.organization",
  "org.gst":           "construction.organization",
  "org.tds":           "construction.organization",
  "org.uom":           "construction.organization",
  "org.work_category": "construction.organization",
  "org.terms":         "construction.organization",
  // Masters (operational)
  "master.project":     "construction.project",
  "master.item":        "construction.masters",
  "master.item_group":  "construction.masters",
  "master.vendor":      "construction.masters",
  "master.contractor":  "construction.masters",
  "master.customer":    "construction.masters",
  "master.location":    "construction.masters",
  "master.machinery":   "construction.masters",
  // Assets/Tools is a MASTERS page — its API routes gate on
  // `construction.masters` (requireMastersAction). It was mis-wired to
  // `construction.stock` here, so toggling the Assets checkbox did nothing to
  // the Assets page and instead revoked Stock Register in the STORE module —
  // the cross-module "unchecking here unchecks Store" bug.
  "master.asset":       "construction.masters",
  "master.cost_center": "construction.masters",
  // Purchase
  "purchase.mr":             "construction.pr",
  "purchase.indent":         "construction.indent",
  "purchase.rfq":            "construction.rfq",
  "purchase.quote_analysis": "construction.rfq",
  "purchase.po":             "construction.po",
  "purchase.grn":            "construction.grn",
  // Store
  "store.stock":       "construction.stock",
  "store.issue":       "construction.issue",
  "store.gate_pass":   "construction.gatepass",
  "store.good_return": "construction.return",
  "store.transfer":    "construction.transfer",
  "store.recon":       "construction.reconciliation",
  "store.diesel":      "construction.diesel",
  // Machinery & Equipment
  "equip.log_book":    "construction.equipment_log",
  "equip.maintenance": "construction.equipment_maintenance",
  "equip.deployment":  "construction.equipment_deployment",
  "equip.fleet":       "construction.equipment_fleet",
  "equip.hire_rent":   "construction.equipment_hire_rent",
  "equip.fixed_assets":"construction.equipment_fixed_assets",
  // Project Mgmt
  "pm.boq":        "construction.boq",
  "pm.wbs":        "construction.wbs",
  "pm.estimation": "construction.estimation",
  "pm.work_order": "construction.wo",
  "pm.dpr":        "construction.dpr",
  "pm.gantt":      "construction.gantt",
  "pm.hindrance":  "construction.hindrance",
  "pm.documents":  "construction.documents",
  // Quality & Safety
  "quality.home":     "construction.quality_safety",
  "safety.incidents": "construction.quality_safety",
  "safety.toolbox":   "construction.quality_safety",
  // Finance
  "finance.rab":      "construction.rab",
  // System
  "system.approvals": "construction.workflows",
  "system.reports":   "construction.dashboard",
};

/**
 * v2 resource → the menu keys that map to it. Several pages can share one
 * resource (Daily Progress, Gantt View and Hindrance Register all map to
 * construction.dpr). Used by `matrixToRevokes` to avoid one page's
 * unchecked cell revoking a still-granted sibling that shares the resource.
 */
const RESOURCE_TO_MENU_KEYS: Readonly<Record<string, string[]>> = (() => {
  const out: Record<string, string[]> = {};
  for (const [menuKey, resource] of Object.entries(MENU_TO_RESOURCE)) {
    (out[resource] ??= []).push(menuKey);
  }
  return out;
})();

/**
 * Matrix actions are `add` / `edit` / `delete` / `view`. v2 uses
 * `create` / `edit` / `delete` / `view`. Only `add` is renamed.
 */
export type MatrixAction = "add" | "edit" | "delete" | "view";
export type V2Action = "view" | "create" | "edit" | "delete";

const MATRIX_TO_V2_ACTION: Record<MatrixAction, V2Action> = {
  add: "create",
  edit: "edit",
  delete: "delete",
  view: "view",
};

const V2_TO_MATRIX_ACTION: Record<V2Action, MatrixAction> = {
  create: "add",
  edit: "edit",
  delete: "delete",
  view: "view",
};

export type PermissionMatrix = Record<string, Partial<Record<MatrixAction, boolean>>>;
export type RevokeEntry = { resource: string; action: V2Action };

/**
 * Walk a matrix JSON and produce the list of (resource, action) pairs
 * that should be REVOKED (i.e. cells with `false`). Cells with `true`
 * or absent become "no revoke" — the role grant decides whether the
 * user has access.
 */
export function matrixToRevokes(matrix: PermissionMatrix | null | undefined): RevokeEntry[] {
  if (!matrix) return [];
  const out: RevokeEntry[] = [];
  const emitted = new Set<string>();
  for (const [menuKey, row] of Object.entries(matrix)) {
    const resource = MENU_TO_RESOURCE[menuKey];
    if (!resource || !row) continue;
    for (const matrixAction of Object.keys(row) as MatrixAction[]) {
      if (row[matrixAction] !== false) continue;
      // A page can only revoke an action it actually supports. Read-only
      // pages (Gantt View) carry add/edit/delete = false as a UI artifact,
      // not a real deny.
      if (MENU_SUPPORTS[menuKey]?.[matrixAction] === false) continue;
      const v2 = MATRIX_TO_V2_ACTION[matrixAction];
      if (!v2) continue;
      const pairKey = `${resource}:${v2}`;
      if (emitted.has(pairKey)) continue;
      // Several menu rows can map to one v2 resource — Daily Progress,
      // Gantt View and Hindrance Register all map to construction.dpr.
      // Only revoke the shared resource when EVERY page that maps to it
      // AND supports this action has the cell denied; otherwise a sibling
      // that is still granted (DPR) would be stripped by an unchecked
      // neighbour (Hindrance, or read-only Gantt). Pages that don't support
      // the action are excluded so they can't veto the revoke either.
      const siblings = RESOURCE_TO_MENU_KEYS[resource] ?? [menuKey];
      const relevant = siblings.filter(
        (k) => MENU_SUPPORTS[k]?.[matrixAction] !== false,
      );
      const allDenied = relevant.every((k) => matrix[k]?.[matrixAction] === false);
      if (allDenied) {
        out.push({ resource, action: v2 });
        emitted.add(pairKey);
      }
    }
  }
  return out;
}

/**
 * Reverse direction: given the user's revoke set, build the matrix JSON
 * shape the Permissions UI expects. Walks every menu in MENU_CATALOG and
 * sets the matching cells to `false` when a revoke exists.
 *
 * Cells NOT in the revoke set are written as `true` so the UI shows the
 * "ticked" state for them. This matches the legacy behavior where the
 * matrix was assumed-allow if absent.
 */
export function revokesToMatrix(
  revokes: ReadonlyArray<{ resource: string; action: string }>,
): PermissionMatrix {
  const revokeSet = new Set(revokes.map((r) => `${r.resource}:${r.action}`));
  const matrix: PermissionMatrix = {};
  for (const item of MENU_CATALOG) {
    const resource = MENU_TO_RESOURCE[item.key];
    if (!resource) continue; // menus not bridged into v2 (e.g. quality.home)
    const row: Partial<Record<MatrixAction, boolean>> = {};
    for (const matrixAction of ["add", "edit", "delete", "view"] as MatrixAction[]) {
      const v2 = MATRIX_TO_V2_ACTION[matrixAction];
      const revoked = revokeSet.has(`${resource}:${v2}`);
      row[matrixAction] = !revoked;
    }
    matrix[item.key] = row;
  }
  return matrix;
}

/**
 * Returns the set of (resource, action) pairs the matrix MANAGES — i.e.
 * the universe of pairs that should be reconciled against the user's
 * revoke rows when saving.
 *
 * Used by the PATCH endpoint to scope DELETE-then-INSERT: delete any
 * managed revoke row not in the new matrix's deny set, then upsert the
 * ones that are.
 */
export function managedPairs(): RevokeEntry[] {
  const out: RevokeEntry[] = [];
  const seen = new Set<string>();
  for (const item of MENU_CATALOG) {
    const resource = MENU_TO_RESOURCE[item.key];
    if (!resource) continue;
    for (const matrixAction of ["add", "edit", "delete", "view"] as MatrixAction[]) {
      const v2 = MATRIX_TO_V2_ACTION[matrixAction];
      const key = `${resource}:${v2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ resource, action: v2 });
    }
  }
  return out;
}

void V2_TO_MATRIX_ACTION;
