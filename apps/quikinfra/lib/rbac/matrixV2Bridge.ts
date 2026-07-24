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
import { allPermissionPairs } from "./permissionsRegistry";

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
  // Organization — per-page resources (per-page-permissions split, Phase 4).
  // Each page now owns its resource and toggles independently; the routes
  // (app/api/masters/*) gate on the matching construction.org_* resource.
  "org.company":       "construction.org_company",
  "org.department":    "construction.org_department",
  "org.gst":           "construction.org_gst",
  "org.tds":           "construction.org_tds",
  "org.uom":           "construction.org_uom",
  "org.work_category": "construction.org_work_category",
  "org.terms":         "construction.org_terms",
  // Masters — per-page resources (per-page-permissions split, Phase 4).
  // Each page owns its own construction.master_* resource, so unchecking one
  // no longer moves the whole cluster. Projects keeps its own
  // construction.project (it was never part of the masters umbrella).
  "master.project":     "construction.project",
  "master.item":        "construction.master_item",
  "master.item_group":  "construction.master_item_group",
  "master.vendor":      "construction.master_vendor",
  "master.contractor":  "construction.master_contractor",
  "master.customer":    "construction.master_customer",
  "master.location":    "construction.master_location",
  "master.machinery":   "construction.master_machinery",
  "master.asset":       "construction.master_asset",
  "master.cost_center": "construction.master_cost_center",
  "master.labour":      "construction.master_labour",
  "master.workman":     "construction.master_workman",
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
 * All menu keys that share the given key's v2 resource (including the key
 * itself). The v2 permission store is resource-level, so pages sharing a
 * resource cannot be granted/revoked independently — e.g. every MASTERS
 * page maps to `construction.masters`. The Permissions UI uses this to
 * toggle the whole cluster together: unchecking one page then writes a
 * real revoke (matrixToRevokes only revokes a shared resource when EVERY
 * page on it is denied), which persists and is actually enforced.
 *
 * A key with no bridged resource returns just itself.
 */
export function siblingMenuKeys(menuKey: string): string[] {
  const resource = MENU_TO_RESOURCE[menuKey];
  if (!resource) return [menuKey];
  return RESOURCE_TO_MENU_KEYS[resource] ?? [menuKey];
}

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
// `action` is a real v2 action string — the 4 matrix columns (view/create/
// edit/delete) PLUS the extra actions each resource may carry (import,
// export, approve, reverse, lock, receive). See ACTION_TO_COLUMN.
export type RevokeEntry = { resource: string; action: string };

/**
 * Real v2 action → the matrix column that governs it. The Permissions UI
 * only shows 4 columns, but resources carry more actions (a PO has
 * `approve`, a BOQ has `import`/`lock`, Masters has `import`/`export`, …).
 * Those extra actions were NEVER revoked when a page/module was unchecked,
 * so turning a module off left `import`/`export`/`approve`/… still granted
 * — which kept the module "assigned" (modulesFromRevokes needs EVERY pair
 * revoked) and visible in the sidebar. Mapping each extra action onto a
 * column lets the matrix revoke the FULL action set, matching the module
 * checkbox flow (applyModuleRevokes, which already revokes all actions).
 * `manage` is intentionally absent — it's the settings tier, never matrix-
 * managed (governed by the separate "Grant Settings access" flow).
 */
const ACTION_TO_COLUMN: Readonly<Record<string, MatrixAction>> = {
  view: "view",
  export: "view",
  create: "add",
  import: "add",
  edit: "edit",
  approve: "edit",
  reverse: "edit",
  lock: "edit",
  receive: "edit",
  delete: "delete",
};

/**
 * Every real (resource, action) pair the matrix manages: pairs whose
 * resource is bridged into a menu row AND whose action maps to one of the
 * 4 columns. Built once from the permission tree so new actions on a
 * resource are picked up automatically.
 */
function bridgedResourceActions(): ReadonlyArray<{ resource: string; action: string }> {
  const bridged = new Set(Object.values(MENU_TO_RESOURCE));
  return allPermissionPairs().filter(
    (p) => bridged.has(p.resource) && ACTION_TO_COLUMN[p.action] !== undefined,
  );
}

/**
 * Walk a matrix JSON and produce the list of (resource, action) pairs
 * that should be REVOKED (i.e. cells with `false`). Cells with `true`
 * or absent become "no revoke" — the role grant decides whether the
 * user has access.
 */
export function matrixToRevokes(matrix: PermissionMatrix | null | undefined): RevokeEntry[] {
  if (!matrix) return [];

  // Step 1 — which (resource, column) are denied? A shared resource's column
  // is denied only when EVERY page mapping to it (and supporting the column)
  // has the cell unchecked. This preserves the anti-bleed guard: an unchecked
  // neighbour can't strip a sibling that's still granted, and read-only pages
  // (Gantt) whose add/edit/delete are forced-false can't veto anything.
  const deniedColumns = new Set<string>(); // `${resource}:${matrixColumn}`
  for (const [menuKey, row] of Object.entries(matrix)) {
    const resource = MENU_TO_RESOURCE[menuKey];
    if (!resource || !row) continue;
    for (const matrixAction of Object.keys(row) as MatrixAction[]) {
      if (row[matrixAction] !== false) continue;
      if (MENU_SUPPORTS[menuKey]?.[matrixAction] === false) continue;
      const siblings = RESOURCE_TO_MENU_KEYS[resource] ?? [menuKey];
      const relevant = siblings.filter(
        (k) => MENU_SUPPORTS[k]?.[matrixAction] !== false,
      );
      const allDenied = relevant.every((k) => matrix[k]?.[matrixAction] === false);
      if (allDenied) deniedColumns.add(`${resource}:${matrixAction}`);
    }
  }

  // Step 2 — expand each denied column to EVERY real action it governs, so
  // extra actions (import/export/approve/reverse/lock/receive) are revoked
  // alongside the visible 4. Without this the module never fully drops.
  const out: RevokeEntry[] = [];
  const emitted = new Set<string>();
  for (const { resource, action } of bridgedResourceActions()) {
    const column = ACTION_TO_COLUMN[action];
    if (!deniedColumns.has(`${resource}:${column}`)) continue;
    const pairKey = `${resource}:${action}`;
    if (emitted.has(pairKey)) continue;
    emitted.add(pairKey);
    out.push({ resource, action });
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
  // Full real action set per bridged resource (not just the 4 columns) so
  // the PATCH reconciler grants back import/export/approve/… when a module
  // is re-checked, mirroring what matrixToRevokes revokes when it's off.
  for (const { resource, action } of bridgedResourceActions()) {
    const key = `${resource}:${action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ resource, action });
  }
  return out;
}

void V2_TO_MATRIX_ACTION;
