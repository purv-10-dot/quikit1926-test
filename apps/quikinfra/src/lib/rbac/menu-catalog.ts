/**
 * Menu Catalog — rows in the per-user Permission Matrix.
 *
 * Mirrors the real sidebar exactly (see `QuikInfraShell.tsx` →
 * CONSTRUCTION_NAV). Group order and names here MUST match that nav so
 * the matrix rows read like the menu users already know.
 *
 * Groups / parents:
 *   ORGANIZATION       (Companies, Departments, GST, TDS, UOM, …)
 *   MASTERS            (Projects, Items, Vendors, Contractors, …)
 *   PURCHASE           (MR, Indents, RFQ, PO)
 *   STORE              (Stock Register, Issue, Gate Pass, Transfer, GRN, …)
 *   PROJECT MGMT       (BOQ, Estimation, WO, DPR, RAB, Gantt, …)
 *
 * Each row's `supports` map declares which of Add/Edit/Delete/View are
 * meaningful for that page. Read-only pages (Stock Register, Gantt View,
 * Reports) have `add/edit/delete` disabled in the matrix.
 */

export interface MenuItem {
  key: string;         // stable id, e.g. "org.company"
  label: string;       // display label ("Companies")
  url?: string;        // destination
  module: MenuModule;  // which group header the row sits under
  supports: {
    add: boolean;
    edit: boolean;
    delete: boolean;
    view: boolean;
  };
}

const allFour = { add: true, edit: true, delete: true, view: true };
const readOnly = { add: false, edit: false, delete: false, view: true };
const writeOnly = { add: true, edit: true, delete: false, view: true };

export const MENU_MODULES = [
  "ORGANIZATION",
  "MASTERS",
  "PURCHASE",
  "STORE",
  "PROJECT MGMT",
  "QUALITY & SAFETY",
  "SYSTEM",
] as const;

export type MenuModule = (typeof MENU_MODULES)[number];

/**
 * Canonical list of permission-gated pages, mirroring the real sidebar
 * structure one-for-one. When you add a new page to CONSTRUCTION_NAV,
 * add a matching row here so it shows up in the user permission matrix.
 */
export const MENU_CATALOG: MenuItem[] = [
  // ─── ORGANIZATION ────────────────────────────────────────────────
  // Mirror order/contents of CONSTRUCTION_NAV → ORGANIZATION group.
  // Banks (/masters/banks) was previously listed here but is NOT in the
  // sidebar, which made the matrix grant a permission users couldn't
  // navigate to. Drop it from the matrix until/unless the sidebar adds it.
  { key: "org.company",       label: "Companies",          url: "/masters/companies",        module: "ORGANIZATION", supports: allFour },
  { key: "org.department",    label: "Departments",        url: "/masters/departments",      module: "ORGANIZATION", supports: allFour },
  { key: "org.gst",           label: "GST Codes",          url: "/masters/gst",              module: "ORGANIZATION", supports: allFour },
  { key: "org.tds",           label: "TDS Codes",          url: "/masters/tds",              module: "ORGANIZATION", supports: allFour },
  { key: "org.uom",           label: "UOM",                url: "/masters/uom",              module: "ORGANIZATION", supports: allFour },
  { key: "org.work_category", label: "Work Categories",    url: "/masters/work-categories",  module: "ORGANIZATION", supports: allFour },
  { key: "org.terms",         label: "Terms & Conditions", url: "/masters/terms",            module: "ORGANIZATION", supports: allFour },

  // ─── MASTERS ─────────────────────────────────────────────────────
  { key: "master.project",      label: "Projects",          url: "/masters/projects",     module: "MASTERS", supports: allFour },
  { key: "master.item",         label: "Items / Materials", url: "/masters/items",        module: "MASTERS", supports: allFour },
  { key: "master.item_group",   label: "Item Groups",       url: "/masters/item-groups",  module: "MASTERS", supports: allFour },
  { key: "master.vendor",       label: "Vendors",           url: "/masters/vendors",      module: "MASTERS", supports: allFour },
  { key: "master.contractor",   label: "Contractors",       url: "/masters/contractors",  module: "MASTERS", supports: allFour },
  { key: "master.customer",     label: "Customers",         url: "/masters/customers",    module: "MASTERS", supports: allFour },
  { key: "master.location",     label: "Locations / Sites", url: "/masters/locations",    module: "MASTERS", supports: allFour },
  { key: "master.machinery",    label: "Machinery",         url: "/masters/machinery",    module: "MASTERS", supports: allFour },
  { key: "master.asset",        label: "Assets / Tools",    url: "/masters/assets",       module: "MASTERS", supports: allFour },
  { key: "master.cost_center",  label: "Cost Centers",      url: "/masters/cost-centers", module: "MASTERS", supports: allFour },

  // ─── PURCHASE ────────────────────────────────────────────────────
  { key: "purchase.mr",     label: "Purchase Requisitions", url: "/purchase/requisitions", module: "PURCHASE", supports: allFour },
  { key: "purchase.indent", label: "Indents",               url: "/purchase/indents",      module: "PURCHASE", supports: allFour },
  { key: "purchase.rfq",          label: "RFQ",                         url: "/purchase/rfqs",          module: "PURCHASE", supports: allFour },
  { key: "purchase.quote_analysis", label: "Quote Analysis & Shortlist", url: "/purchase/quote-analysis", module: "PURCHASE", supports: allFour },
  { key: "purchase.po",           label: "Purchase Orders",             url: "/purchase/orders",        module: "PURCHASE", supports: allFour },

  // ─── STORE ───────────────────────────────────────────────────────
  // GRN lives under STORE in the UI — it's the "goods in" counterpart of
  // Material Issue. The permission key stays `purchase.grn.*` to avoid
  // re-seeding RBAC rows; only the menu grouping moved.
  { key: "purchase.grn",      label: "GRN",                  url: "/store/grn",            module: "STORE", supports: allFour },
  { key: "store.stock",       label: "Stock Register",       url: "/store/stock-register", module: "STORE", supports: readOnly },
  { key: "store.issue",       label: "Material Issue",       url: "/store/issue",          module: "STORE", supports: allFour },
  { key: "store.gate_pass",   label: "Gate Pass",            url: "/store/gate-pass",      module: "STORE", supports: allFour },
  { key: "store.good_return", label: "Good Return",          url: "/store/good-return",    module: "STORE", supports: allFour },
  { key: "store.transfer",    label: "Stock Transfer",       url: "/store/transfer",       module: "STORE", supports: allFour },
  { key: "store.recon",       label: "Stock Reconciliation", url: "/store/reconciliation", module: "STORE", supports: allFour },
  { key: "store.diesel",      label: "Diesel Log",           url: "/store/diesel-log",     module: "STORE", supports: writeOnly },
  { key: "store.asset_mgmt",  label: "Asset Management",     url: "/store/asset-management", module: "STORE", supports: allFour },

  // ─── PROJECT MGMT ────────────────────────────────────────────────
  // Mirror order/contents of CONSTRUCTION_NAV → PROJECT MGMT group.
  // Running A/c Bill (/projects/rab) was previously listed here but is
  // NOT in the sidebar — same reason as Banks above. Drop it until the
  // sidebar grows the link.
  { key: "pm.boq",        label: "BOQ",                  url: "/projects/boq",         module: "PROJECT MGMT", supports: allFour },
  { key: "pm.wbs",        label: "WBS & Planning",       url: "/projects/wbs",         module: "PROJECT MGMT", supports: allFour },
  { key: "pm.estimation", label: "Material Estimation", url: "/projects/estimation",  module: "PROJECT MGMT", supports: allFour },
  { key: "pm.work_order", label: "Work Orders",          url: "/projects/work-orders", module: "PROJECT MGMT", supports: allFour },
  { key: "pm.dpr",        label: "Daily Progress (DPR)", url: "/projects/dpr",         module: "PROJECT MGMT", supports: allFour },
  { key: "pm.gantt",      label: "Gantt View",           url: "/projects/gantt",       module: "PROJECT MGMT", supports: readOnly },
  { key: "pm.hindrance",  label: "Hindrance Register",   url: "/projects/hindrance",   module: "PROJECT MGMT", supports: allFour },
  { key: "pm.documents",  label: "Documents",            url: "/projects/documents",   module: "PROJECT MGMT", supports: allFour },

  // ─── QUALITY & SAFETY ────────────────────────────────────────────
  // Mirrors CONSTRUCTION_NAV → QUALITY & SAFETY group.
  { key: "quality.home",      label: "Inspection/Checklist", url: "/quality",              module: "QUALITY & SAFETY", supports: allFour },
  { key: "safety.incidents",  label: "Incidents",            url: "/safety/incidents",     module: "QUALITY & SAFETY", supports: allFour },
  { key: "safety.toolbox",    label: "Toolbox Talks",        url: "/safety/toolbox-talks", module: "QUALITY & SAFETY", supports: allFour },

  // ─── SYSTEM ─────────────────────────────────────────────────────
  // SYSTEM items are NOT in ASSIGNABLE_MODULES — they can't be granted
  // via the Modules (Multiple) picker. Instead, admins explicitly tick
  // them on the Permissions page per user. Default is hidden because
  // `buildMatrixFromModules` only grants items whose `module` is in the
  // user's `modulesAssigned` — SYSTEM never is, so these default to off.
  { key: "system.approvals", label: "Approvals", url: "/approvals", module: "SYSTEM", supports: readOnly },
  { key: "system.reports",   label: "Reports",   url: "/reports",   module: "SYSTEM", supports: readOnly },
];

export type MatrixAction = "add" | "edit" | "delete" | "view";

export const MATRIX_ACTIONS: MatrixAction[] = ["add", "edit", "delete", "view"];

/** Row-level permission toggles — one per menu item. */
export interface MatrixRow {
  add: boolean;
  edit: boolean;
  delete: boolean;
  view: boolean;
}

/** Full user matrix: `{ "org.company": { add, edit, delete, view }, … }` */
export type PermissionMatrix = Record<string, MatrixRow>;

/**
 * Drop rows where every action is `false`. The /api/me response only sends
 * granted rows so the payload stays small and the client can treat any
 * absent row as fully denied (see `canViewMenu` / `canMenuAction`).
 *
 * Accepts the loose `Record<string, Record<string, boolean>>` shape used
 * in tenant-context plumbing — strict `MatrixRow` shape isn't required
 * because the helper only reads booleans.
 */
export function stripDeniedRows(
  matrix: Record<string, Record<string, boolean>> | null | undefined,
): Record<string, Record<string, boolean>> | null {
  if (!matrix) return matrix ?? null;
  const out: Record<string, Record<string, boolean>> = {};
  for (const [key, row] of Object.entries(matrix)) {
    if (row.add || row.edit || row.delete || row.view) {
      out[key] = row;
    }
  }
  return out;
}

/**
 * URL → menu-key lookup. Lets the sidebar resolve a nav item's href back
 * to its `MENU_CATALOG` key so we can read the user's saved permission
 * matrix for that row (e.g. href `/purchase/indents` → `purchase.indent`
 * → `matrix["purchase.indent"].view`). Built once at module load.
 */
const URL_TO_MENU_KEY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const item of MENU_CATALOG) {
    if (item.url) out[item.url] = item.key;
  }
  return out;
})();

export function menuKeyForUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return URL_TO_MENU_KEY[url];
}

/**
 * Map the `modulesAssigned` keys used on the user form (lowercase,
 * underscore-separated) to the `MenuModule` group headers in the catalog
 * (uppercase, space-separated). Keep this in sync with `ASSIGNABLE_MODULES`
 * in `user-types.ts`.
 */
export const MODULE_KEY_TO_MENU_MODULE: Record<string, MenuModule> = {
  organization: "ORGANIZATION",
  masters: "MASTERS",
  purchase: "PURCHASE",
  store: "STORE",
  project_mgmt: "PROJECT MGMT",
  quality_safety: "QUALITY & SAFETY",
};

/**
 * Build a permission matrix that grants everything under the given
 * assigned modules and denies everything else. Used to seed a new user's
 * permissions from their `modulesAssigned` selection so admins don't
 * have to tick 30+ boxes by hand — they can still fine-tune on the
 * Permissions page afterwards.
 */
export function buildMatrixFromModules(
  modulesAssigned: string[] | null | undefined,
): PermissionMatrix {
  const assigned = new Set(
    (modulesAssigned ?? [])
      .map((k) => MODULE_KEY_TO_MENU_MODULE[k])
      .filter(Boolean),
  );
  const out: PermissionMatrix = {};
  for (const item of MENU_CATALOG) {
    const grant = assigned.has(item.module);
    // Assigning a module grants the FULL action set (add/edit/delete/view)
    // on its pages by default — so a user given a module can actually
    // operate it, matching the role's grants. Unassigned modules get nothing.
    // The admin can still untick specific actions and Save to narrow it.
    out[item.key] = {
      add: item.supports.add && grant,
      edit: item.supports.edit && grant,
      delete: item.supports.delete && grant,
      view: item.supports.view && grant,
    };
  }
  return out;
}

/**
 * Module-driven display matrix for the Permissions admin page.
 *
 * Starts from the assigned-modules view-only scaffold, then overlays the
 * user's saved matrix ONLY for pages whose module is actually assigned.
 * Pages in UNASSIGNED modules stay fully off — this suppresses the
 * "granted-unless-revoked" display noise where a non-assigned page shows
 * ticked just because:
 *   - it shares a v2 resource with an assigned module (e.g. Assets/Tools
 *     maps to `construction.stock`, the same resource as the Store module), or
 *   - the revoke set didn't explicitly cover every action (leaving stray
 *     ticks like delete-only on Quality pages or add-only on Projects), or
 *   - a system page (Approvals/Reports) was never revoked.
 *
 * Result: the matrix shows ONLY the assigned modules' pages — view-ticked by
 * default, with the admin's own within-module edits preserved.
 */
export function buildModuleScopedMatrix(
  modulesAssigned: string[] | null | undefined,
  saved: PermissionMatrix | null | undefined,
): PermissionMatrix {
  const assigned = new Set(
    (modulesAssigned ?? [])
      .map((k) => MODULE_KEY_TO_MENU_MODULE[k])
      .filter(Boolean),
  );
  const out = buildMatrixFromModules(modulesAssigned);
  if (!saved) return out;
  for (const item of MENU_CATALOG) {
    if (!assigned.has(item.module)) continue; // unassigned → keep base (off)
    const row = saved[item.key];
    if (!row) continue;
    out[item.key] = {
      add: item.supports.add && row.add === true,
      edit: item.supports.edit && row.edit === true,
      delete: item.supports.delete && row.delete === true,
      // Assigned-module pages are viewable by default; respect an explicit
      // saved deny (view === false) but default to on when unspecified.
      view: item.supports.view && row.view !== false,
    };
  }
  return out;
}

/**
 * Build a fresh matrix with all supported actions set to `value`.
 * Unsupported actions on a row (e.g. "edit" on a read-only report) are
 * always false regardless of `value`.
 */
export function buildDefaultMatrix(value: boolean): PermissionMatrix {
  const out: PermissionMatrix = {};
  for (const item of MENU_CATALOG) {
    out[item.key] = {
      add: item.supports.add && value,
      edit: item.supports.edit && value,
      delete: item.supports.delete && value,
      view: item.supports.view && value,
    };
  }
  return out;
}

/**
 * Merge a partial matrix onto a baseline. Used when loading a user's
 * saved matrix over the default (so a newly-added menu row is still
 * reachable even if the saved matrix doesn't mention it yet).
 */
export function mergeMatrix(
  base: PermissionMatrix,
  patch: PermissionMatrix | undefined | null
): PermissionMatrix {
  if (!patch) return base;
  const out: PermissionMatrix = { ...base };
  for (const key of Object.keys(patch)) {
    out[key] = {
      ...(out[key] ?? { add: false, edit: false, delete: false, view: false }),
      ...patch[key],
    };
  }
  return out;
}

/**
 * Inverse of `MODULE_KEY_TO_MENU_MODULE` — maps the group header used in
 * the matrix ("STORE", "PROJECT MGMT") back to the short module key the
 * user form stores in `modulesAssigned` ("store", "project_mgmt"). SYSTEM
 * is intentionally absent: it's never a user-assignable module.
 */
const MENU_MODULE_TO_MODULE_KEY: Partial<Record<MenuModule, string>> = (() => {
  const out: Partial<Record<MenuModule, string>> = {};
  for (const [moduleKey, menuModule] of Object.entries(MODULE_KEY_TO_MENU_MODULE)) {
    out[menuModule] = moduleKey;
  }
  return out;
})();

/**
 * Derive the `modulesAssigned` set from a permission matrix. A module
 * counts as "assigned" the moment any action on any row inside it is
 * enabled. Used in two places:
 *
 *   1. Backend write path — on save, the route re-derives modulesAssigned
 *      from the matrix so the coarse flag the sidebar consults stays in
 *      sync with the granular grants the admin just made. Source of truth
 *      is the matrix; modulesAssigned is a cached roll-up.
 *   2. Frontend Edit User drawer — when opening the drawer for a user,
 *      the module checkboxes fold in any matrix-derived modules so the
 *      admin sees exactly what the user has effective access to, even
 *      if the server copy is stale.
 *
 * Returns a de-duplicated, order-stable array (same order as
 * ASSIGNABLE_MODULES in user-types.ts).
 */
export function deriveModulesFromMatrix(
  matrix: PermissionMatrix | null | undefined,
): string[] {
  if (!matrix) return [];
  const assigned = new Set<string>();
  for (const item of MENU_CATALOG) {
    const row = matrix[item.key];
    if (!row) continue;
    const anyGranted =
      (item.supports.add && row.add) ||
      (item.supports.edit && row.edit) ||
      (item.supports.delete && row.delete) ||
      (item.supports.view && row.view);
    if (!anyGranted) continue;
    const moduleKey = MENU_MODULE_TO_MODULE_KEY[item.module];
    if (moduleKey) assigned.add(moduleKey);
  }
  // Preserve the canonical ordering so callers can compare arrays without
  // worrying about Set iteration order or user-form ordering drift.
  const ordering = Object.keys(MODULE_KEY_TO_MENU_MODULE);
  return ordering.filter((k) => assigned.has(k));
}

/**
 * Union of an explicit modulesAssigned array with whatever the matrix
 * grants. Use this at read sites that need the effective visibility set
 * without caring about staleness on either side.
 */
export function mergeModulesWithMatrix(
  modulesAssigned: string[] | null | undefined,
  matrix: PermissionMatrix | null | undefined,
): string[] {
  const fromMatrix = deriveModulesFromMatrix(matrix);
  const seen = new Set<string>([...(modulesAssigned ?? []), ...fromMatrix]);
  const ordering = Object.keys(MODULE_KEY_TO_MENU_MODULE);
  return ordering.filter((k) => seen.has(k));
}

/**
 * Group menu items by module in the exact order declared in MENU_MODULES.
 * Using a Map preserves insertion order for iteration — objects don't
 * guarantee key order for non-numeric keys across all runtimes, so the
 * matrix page iterates this map to render groups top-to-bottom.
 */
export function groupByModule(): Map<MenuModule, MenuItem[]> {
  const out = new Map<MenuModule, MenuItem[]>();
  for (const mod of MENU_MODULES) out.set(mod, []);
  for (const item of MENU_CATALOG) {
    const list = out.get(item.module) ?? [];
    list.push(item);
    out.set(item.module, list);
  }
  return out;
}
