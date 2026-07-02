/**
 * QuikInfra — Permission Registry (single source of truth).
 *
 * Used by:
 *   - Seeder (allPermissionPairs)      → fills RolePermission rows
 *   - Server validator (isValidPair)   → rejects unknown (resource, action)
 *   - Matrix UI (PERMISSION_TREE)      → renders the row/column grid
 *   - Sidebar (NAV_RESOURCE)           → hides items a user can't view
 *
 * Mirrors src/lib/permissions.ts content in a structured shape so the v2
 * RBAC subsystem can consume it. The legacy file stays as the runtime
 * fallback until the v2 path is fully wired (Phase 6).
 */

// ─── Actions ────────────────────────────────────────────────────────
// Richer than quikscale's CRUDV — kept verbatim from the existing
// permissions.ts so we can seed identical grants on day one.

export const ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "import",
  "export",
  "approve",
  "reverse",
  "receive",
  "lock",
  "manage",
] as const;

export type Action = (typeof ACTIONS)[number];

// ─── Tree shape ─────────────────────────────────────────────────────

export interface PermissionLeaf {
  resource: string;
  label: string;
  actions: readonly Action[];
}

export interface PermissionSubmodule {
  key: string;
  label: string;
  leaves: readonly PermissionLeaf[];
}

export interface PermissionModule {
  key: string;
  label: string;
  leaves?: readonly PermissionLeaf[];
  submodules?: readonly PermissionSubmodule[];
}

// ─── The tree ───────────────────────────────────────────────────────

export const PERMISSION_TREE: readonly PermissionModule[] = [
  {
    key: "Dashboard",
    label: "Dashboard",
    leaves: [
      { resource: "construction.dashboard", label: "Dashboard", actions: ["view"] },
    ],
  },
  {
    key: "Organization",
    label: "Organization",
    leaves: [
      {
        resource: "construction.organization",
        label: "Organization",
        actions: ["view", "create", "edit", "delete"],
      },
    ],
  },
  {
    key: "QualitySafety",
    label: "Quality & Safety",
    leaves: [
      {
        resource: "construction.quality_safety",
        label: "Quality & Safety",
        actions: ["view", "create", "edit"],
      },
    ],
  },
  {
    key: "Masters",
    label: "Masters",
    leaves: [
      {
        resource: "construction.masters",
        label: "Masters",
        actions: ["view", "create", "edit", "delete", "import", "export"],
      },
    ],
  },
  {
    key: "Purchase",
    label: "Purchase",
    submodules: [
      {
        key: "PR",
        label: "Purchase Requisition",
        leaves: [
          { resource: "construction.pr", label: "Purchase Requisition", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "Indent",
        label: "Indent",
        leaves: [
          { resource: "construction.indent", label: "Indent", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "RFQ",
        label: "RFQ",
        leaves: [
          { resource: "construction.rfq", label: "RFQ", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "PO",
        label: "Purchase Order",
        leaves: [
          { resource: "construction.po", label: "Purchase Order", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "GRN",
        label: "GRN",
        leaves: [
          { resource: "construction.grn", label: "Goods Receipt Note", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
    ],
  },
  {
    key: "Store",
    label: "Store",
    submodules: [
      {
        key: "Stock",
        label: "Stock",
        leaves: [
          { resource: "construction.stock", label: "Stock", actions: ["view"] },
        ],
      },
      {
        key: "Issue",
        label: "Material Issue",
        leaves: [
          { resource: "construction.issue", label: "Material Issue", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "Gatepass",
        label: "Gate Pass",
        leaves: [
          { resource: "construction.gatepass", label: "Gate Pass", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "Return",
        label: "Returns",
        leaves: [
          { resource: "construction.return", label: "Returns", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "Transfer",
        label: "Stock Transfer",
        leaves: [
          { resource: "construction.transfer", label: "Stock Transfer", actions: ["view", "create", "edit", "delete", "approve", "receive"] },
        ],
      },
      {
        key: "Reconciliation",
        label: "Stock Reconciliation",
        leaves: [
          { resource: "construction.reconciliation", label: "Stock Reconciliation", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "Diesel",
        label: "Diesel Log",
        leaves: [
          { resource: "construction.diesel", label: "Diesel Log", actions: ["view", "create", "edit", "delete"] },
        ],
      },
    ],
  },
  {
    key: "MachineryEquipment",
    label: "Machinery & Equipment",
    submodules: [
      {
        key: "EquipmentLog",
        label: "Equipment Log Book",
        leaves: [
          {
            resource: "construction.equipment_log",
            label: "Equipment Log Book",
            actions: ["view", "create", "edit", "delete", "approve"],
          },
        ],
      },
      {
        key: "Maintenance",
        label: "Maintenance",
        leaves: [
          {
            resource: "construction.equipment_maintenance",
            label: "Maintenance",
            actions: ["view", "create", "edit", "delete"],
          },
        ],
      },
      {
        key: "Deployment",
        label: "Deployment & Compliance",
        leaves: [
          {
            resource: "construction.equipment_deployment",
            label: "Deployment & Compliance",
            actions: ["view", "create", "edit", "delete"],
          },
        ],
      },
      {
        key: "Fleet",
        label: "Fleet Dashboard",
        leaves: [
          {
            resource: "construction.equipment_fleet",
            label: "Fleet Dashboard",
            actions: ["view"],
          },
        ],
      },
      {
        key: "HireRent",
        label: "Hire & Rent",
        leaves: [
          {
            resource: "construction.equipment_hire_rent",
            label: "Hire & Rent",
            actions: ["view", "create", "edit"],
          },
        ],
      },
      {
        key: "FixedAssets",
        label: "Fixed Asset / Tools",
        leaves: [
          {
            resource: "construction.equipment_fixed_assets",
            label: "Fixed Asset / Tools",
            actions: ["view", "create", "edit"],
          },
        ],
      },
    ],
  },
  {
    key: "Projects",
    label: "Projects",
    submodules: [
      {
        key: "Project",
        label: "Project",
        leaves: [
          { resource: "construction.project", label: "Project", actions: ["view", "create", "edit", "delete"] },
        ],
      },
      {
        key: "BOQ",
        label: "BOQ",
        leaves: [
          { resource: "construction.boq", label: "BOQ", actions: ["view", "create", "edit", "delete", "import", "lock"] },
        ],
      },
      {
        key: "WBS",
        label: "Work Breakdown Structure",
        leaves: [
          { resource: "construction.wbs", label: "WBS Tasks", actions: ["view", "create", "edit", "delete"] },
        ],
      },
      {
        key: "Estimation",
        label: "Material Estimation",
        leaves: [
          { resource: "construction.estimation", label: "Material Estimation", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "WorkOrder",
        label: "Work Order",
        leaves: [
          { resource: "construction.wo", label: "Work Order", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
      {
        key: "DPR",
        label: "Daily Progress Report",
        leaves: [
          { resource: "construction.dpr", label: "Daily Progress Report", actions: ["view", "create", "edit", "delete", "approve", "reverse"] },
        ],
      },
      {
        key: "Gantt",
        label: "Gantt View",
        leaves: [
          { resource: "construction.gantt", label: "Gantt View", actions: ["view"] },
        ],
      },
      {
        key: "Hindrance",
        label: "Hindrance Register",
        leaves: [
          { resource: "construction.hindrance", label: "Hindrance Register", actions: ["view", "create", "edit", "delete"] },
        ],
      },
      {
        key: "Documents",
        label: "Documents",
        leaves: [
          { resource: "construction.documents", label: "Documents", actions: ["view", "create", "edit", "delete"] },
        ],
      },
      {
        key: "RAB",
        label: "Running Account Bill",
        leaves: [
          { resource: "construction.rab", label: "Running Account Bill", actions: ["view", "create", "edit", "delete", "approve"] },
        ],
      },
    ],
  },
  {
    key: "Finance",
    label: "Finance",
    leaves: [
      { resource: "construction.finance", label: "Finance", actions: ["view", "create", "edit", "delete", "approve"] },
    ],
  },
  {
    key: "Settings",
    label: "Settings",
    leaves: [
      { resource: "construction.settings",  label: "Settings",   actions: ["manage"] },
      { resource: "construction.users",     label: "Users",      actions: ["manage"] },
      { resource: "construction.roles",     label: "Roles",      actions: ["manage"] },
      { resource: "construction.workflows", label: "Workflows",  actions: ["manage"] },
    ],
  },
] as const;

// ─── Sidebar nav-key → resource map ─────────────────────────────────
// Used in Phase 5 to filter sidebar items. nav-key matches the `key`
// field on whatever NAV_ITEMS constant the sidebar uses.

export const NAV_RESOURCE: Record<string, string> = {
  "dashboard":            "construction.dashboard",
  "masters":              "construction.masters",
  "purchase.pr":          "construction.pr",
  "purchase.indent":      "construction.indent",
  "purchase.rfq":         "construction.rfq",
  "purchase.po":          "construction.po",
  "purchase.grn":         "construction.grn",
  "store.stock":          "construction.stock",
  "store.issue":          "construction.issue",
  "store.gatepass":       "construction.gatepass",
  "store.return":         "construction.return",
  "store.transfer":       "construction.transfer",
  "store.reconciliation": "construction.reconciliation",
  "store.diesel":         "construction.diesel",
  "equip.log_book":       "construction.equipment_log",
  "equip.maintenance":    "construction.equipment_maintenance",
  "equip.deployment":     "construction.equipment_deployment",
  "equip.fleet":          "construction.equipment_fleet",
  "equip.hire_rent":      "construction.equipment_hire_rent",
  "equip.fixed_assets":   "construction.equipment_fixed_assets",
  "projects.project":     "construction.project",
  "projects.boq":         "construction.boq",
  "projects.estimation":  "construction.estimation",
  "projects.wo":          "construction.wo",
  "projects.dpr":         "construction.dpr",
  "projects.gantt":       "construction.gantt",
  "projects.hindrance":   "construction.hindrance",
  "projects.documents":   "construction.documents",
  "projects.rab":         "construction.rab",
  "settings":             "construction.settings",
  "settings.users":       "construction.users",
  "settings.roles":       "construction.roles",
  "settings.workflows":   "construction.workflows",
};

// ─── Module ↔ resource mapping ──────────────────────────────────────
//
// The Add User form lets admins narrow a user's access by ticking a
// subset of "modules" (Masters, Purchase, Store, Project Mgmt, …). To
// translate that legacy UX into the v2 permission system we need to know
// which `construction.<resource>` entries belong to which module.
//
// Phase 4 uses this map two ways:
//   1. Form POST writes REVOKE entries to `CnUserPermissionExtra` for
//      every (resource, action) in modules the admin did NOT tick.
//   2. `getTenantContext` derives `modulesAssigned` from the effective
//      permission set by asking "does the user still have any
//      permission left in this module's resource list?".
//
// Resources NOT listed under any module (`construction.dashboard`,
// `construction.settings.*`, `construction.users.*`, `construction.roles.*`,
// `construction.workflows.*`) are *outside* the module-toggle taxonomy —
// admins never revoke those via the modules checkboxes; access is
// governed purely by role + UserPermissionExtra grants.

export const MODULE_TO_RESOURCES: Readonly<Record<string, readonly string[]>> = {
  organization: ["construction.organization"],
  masters: ["construction.masters"],
  purchase: [
    "construction.pr",
    "construction.indent",
    "construction.rfq",
    "construction.po",
    "construction.grn",
  ],
  store: [
    "construction.stock",
    "construction.issue",
    "construction.gatepass",
    "construction.return",
    "construction.transfer",
    "construction.reconciliation",
    "construction.diesel",
  ],
  project_mgmt: [
    "construction.project",
    "construction.boq",
    "construction.wbs",
    "construction.estimation",
    "construction.wo",
    "construction.dpr",
    "construction.gantt",
    "construction.hindrance",
    "construction.documents",
    "construction.rab",
  ],
  quality_safety: ["construction.quality_safety"],
  machinery_equipment: ["construction.equipment_log", "construction.equipment_maintenance", "construction.equipment_deployment", "construction.equipment_fleet", "construction.equipment_hire_rent", "construction.equipment_fixed_assets"],
  finance: ["construction.finance"],
} as const;

/**
 * All module keys recognised by the form/sidebar. Used for the
 * "everything EXCEPT the ticked ones" math when computing revokes.
 */
export const ALL_MODULE_KEYS = Object.keys(MODULE_TO_RESOURCES);

/**
 * Returns every (resource, action) pair that belongs to the module's
 * resource list. Pulled from PERMISSION_TREE so the action list stays
 * in sync — if a new action is added to `construction.boq`, it's
 * automatically picked up here without touching the module map.
 */
export function modulePermissionPairs(
  moduleKey: string,
): ReadonlyArray<{ resource: string; action: Action }> {
  const resourceList = MODULE_TO_RESOURCES[moduleKey] ?? [];
  if (resourceList.length === 0) return [];
  const resourceSet = new Set(resourceList);
  return allPermissionPairs().filter((p) => resourceSet.has(p.resource));
}

/**
 * Given the modules the admin TICKED, return the (resource, action)
 * pairs that should be REVOKED — i.e. everything in the un-ticked
 * modules' resource lists. Used by `POST /api/settings/users` to write
 * CnUserPermissionExtra revoke rows alongside the role assignment.
 */
export function pairsToRevokeForModules(
  tickedModules: string[],
): ReadonlyArray<{ resource: string; action: Action }> {
  const ticked = new Set(tickedModules);
  const out: Array<{ resource: string; action: Action }> = [];
  for (const moduleKey of ALL_MODULE_KEYS) {
    if (ticked.has(moduleKey)) continue;
    for (const pair of modulePermissionPairs(moduleKey)) {
      out.push(pair);
    }
  }
  return out;
}

/**
 * Inverse of pairsToRevokeForModules: given the user's effective
 * permission set, infer which modules they "have" — i.e. modules
 * whose resource list still contains at least one permission they hold.
 * Used by `getTenantContext` to populate `modulesAssigned` for the
 * sidebar visibility filter.
 */
export function modulesFromPermissions(permissions: Set<string>): string[] {
  const out: string[] = [];
  for (const moduleKey of ALL_MODULE_KEYS) {
    const resourceList = MODULE_TO_RESOURCES[moduleKey];
    if (!resourceList || resourceList.length === 0) continue;
    const resourceSet = new Set(resourceList);
    // permissions are stored as "resource.action" — match on the
    // resource prefix (everything before the last dot).
    let hasAny = false;
    for (const key of permissions) {
      const lastDot = key.lastIndexOf(".");
      if (lastDot <= 0) continue;
      const resource = key.slice(0, lastDot);
      if (resourceSet.has(resource)) {
        hasAny = true;
        break;
      }
    }
    if (hasAny) out.push(moduleKey);
  }
  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────

export function* walkLeaves(): Generator<PermissionLeaf> {
  for (const mod of PERMISSION_TREE) {
    if (mod.leaves) {
      for (const leaf of mod.leaves) yield leaf;
    }
    if (mod.submodules) {
      for (const sub of mod.submodules) {
        for (const leaf of sub.leaves) yield leaf;
      }
    }
  }
}

let _pairsCache: Array<{ resource: string; action: Action }> | null = null;

export function allPermissionPairs(): ReadonlyArray<{ resource: string; action: Action }> {
  if (_pairsCache) return _pairsCache;
  const out: Array<{ resource: string; action: Action }> = [];
  for (const leaf of walkLeaves()) {
    for (const action of leaf.actions) {
      out.push({ resource: leaf.resource, action });
    }
  }
  _pairsCache = out;
  return out;
}

let _pairSet: Set<string> | null = null;

export function isValidPermissionPair(resource: string, action: string): boolean {
  if (!_pairSet) {
    _pairSet = new Set(allPermissionPairs().map((p) => `${p.resource}::${p.action}`));
  }
  return _pairSet.has(`${resource}::${action}`);
}

export function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

/**
 * Convert a legacy permission key from src/lib/permissions.ts into a
 * (resource, action) pair. The last dot-segment is the action; everything
 * before it is the resource.
 *
 *   parsePermissionKey("construction.boq.view")    → { resource: "construction.boq",  action: "view" }
 *   parsePermissionKey("construction.po.approve")  → { resource: "construction.po",   action: "approve" }
 *   parsePermissionKey("construction.dpr.reverse") → { resource: "construction.dpr",  action: "reverse" }
 *
 * Returns null for malformed keys or actions not in ACTIONS.
 */
export function parsePermissionKey(key: string): { resource: string; action: Action } | null {
  const lastDot = key.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === key.length - 1) return null;
  const action = key.slice(lastDot + 1);
  const resource = key.slice(0, lastDot);
  if (!isAction(action)) return null;
  return { resource, action };
}
