import { describe, it, expect } from "vitest";
import {
  MENU_MODULES,
  MENU_CATALOG,
  MATRIX_ACTIONS,
  stripDeniedRows,
  menuKeyForUrl,
  MODULE_KEY_TO_MENU_MODULE,
  buildMatrixFromModules,
  buildModuleScopedMatrix,
  buildDefaultMatrix,
  mergeMatrix,
  deriveModulesFromMatrix,
  mergeModulesWithMatrix,
  groupByModule,
} from "@/lib/rbac/menu-catalog";
import { MENU_TO_RESOURCE } from "@/lib/rbac/matrixV2Bridge";
import { MODULE_TO_RESOURCES } from "@/lib/rbac/permissionsRegistry";

describe("catalog structure", () => {
  it("every catalog item declares a module that exists in MENU_MODULES", () => {
    for (const item of MENU_CATALOG) {
      expect(MENU_MODULES).toContain(item.module);
    }
  });
  it("every item has a unique key", () => {
    const keys = MENU_CATALOG.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("exposes the four matrix actions", () => {
    expect(MATRIX_ACTIONS).toEqual(["add", "edit", "delete", "view"]);
  });
});

describe("menuKeyForUrl", () => {
  it("resolves a known url to its menu key", () => {
    expect(menuKeyForUrl("/masters/companies")).toBe("org.company");
    expect(menuKeyForUrl("/purchase/indents")).toBe("purchase.indent");
  });
  it("returns undefined for an unknown / missing url", () => {
    expect(menuKeyForUrl("/nope")).toBeUndefined();
    expect(menuKeyForUrl(undefined)).toBeUndefined();
  });
});

describe("stripDeniedRows", () => {
  it("drops rows where every action is false", () => {
    const out = stripDeniedRows({
      a: { add: false, edit: false, delete: false, view: false },
      b: { add: false, edit: false, delete: false, view: true },
    });
    expect(out).toEqual({ b: { add: false, edit: false, delete: false, view: true } });
  });
  it("passes null/undefined through", () => {
    expect(stripDeniedRows(null)).toBeNull();
    expect(stripDeniedRows(undefined)).toBeNull();
  });
});

describe("buildMatrixFromModules", () => {
  it("grants full action set for assigned modules and nothing else", () => {
    const m = buildMatrixFromModules(["organization"]);
    expect(m["org.company"]).toEqual({ add: true, edit: true, delete: true, view: true });
    // a MASTERS item is not assigned → fully off
    expect(m["master.project"]).toEqual({ add: false, edit: false, delete: false, view: false });
  });
  it("respects read-only support flags (no add on a readOnly page)", () => {
    const m = buildMatrixFromModules(["store"]);
    // store.stock is readOnly → only view can be true
    expect(m["store.stock"]).toEqual({ add: false, edit: false, delete: false, view: true });
  });
  it("returns all-false for empty/null input", () => {
    const m = buildMatrixFromModules(null);
    expect(Object.values(m).every((r) => !r.add && !r.edit && !r.delete && !r.view)).toBe(true);
  });
});

describe("buildModuleScopedMatrix", () => {
  it("overlays saved edits only for assigned-module pages", () => {
    const saved = { "org.company": { add: false, edit: false, delete: false, view: true } };
    const out = buildModuleScopedMatrix(["organization"], saved);
    expect(out["org.company"]).toEqual({ add: false, edit: false, delete: false, view: true });
  });
  it("ignores saved rows for unassigned modules (stay off)", () => {
    const saved = { "master.project": { add: true, edit: true, delete: true, view: true } };
    const out = buildModuleScopedMatrix(["organization"], saved);
    expect(out["master.project"]).toEqual({ add: false, edit: false, delete: false, view: false });
  });
  it("falls back to base matrix when saved is null", () => {
    const out = buildModuleScopedMatrix(["organization"], null);
    expect(out["org.company"].view).toBe(true);
  });
});

describe("buildDefaultMatrix", () => {
  it("sets supported actions to the given value, unsupported stay false", () => {
    const m = buildDefaultMatrix(true);
    expect(m["org.company"]).toEqual({ add: true, edit: true, delete: true, view: true });
    // read-only page: only view can be true even with value=true
    expect(m["store.stock"]).toEqual({ add: false, edit: false, delete: false, view: true });
  });
});

describe("mergeMatrix", () => {
  it("returns base unchanged when patch is null", () => {
    const base = buildDefaultMatrix(false);
    expect(mergeMatrix(base, null)).toBe(base);
  });
  it("overlays patch keys onto base", () => {
    const base = buildDefaultMatrix(false);
    const out = mergeMatrix(base, { "org.company": { add: true, edit: false, delete: false, view: true } });
    expect(out["org.company"]).toMatchObject({ add: true, view: true });
  });
});

describe("deriveModulesFromMatrix / mergeModulesWithMatrix", () => {
  it("derives a module when any of its rows has a granted action", () => {
    const matrix = buildMatrixFromModules(["organization"]);
    expect(deriveModulesFromMatrix(matrix)).toContain("organization");
  });
  it("derives nothing from an all-false matrix", () => {
    expect(deriveModulesFromMatrix(buildDefaultMatrix(false))).toEqual([]);
  });
  it("returns [] for null matrix", () => {
    expect(deriveModulesFromMatrix(null)).toEqual([]);
  });
  it("unions explicit modulesAssigned with matrix-derived ones, order-stable", () => {
    const matrix = buildMatrixFromModules(["store"]);
    const merged = mergeModulesWithMatrix(["organization"], matrix);
    expect(merged).toContain("organization");
    expect(merged).toContain("store");
    // order follows MODULE_KEY_TO_MENU_MODULE key order
    expect(merged.indexOf("organization")).toBeLessThan(merged.indexOf("store"));
  });
});

describe("groupByModule", () => {
  it("groups items under each module header preserving MENU_MODULES order", () => {
    const grouped = groupByModule();
    expect([...grouped.keys()]).toEqual([...MENU_MODULES]);
    const total = [...grouped.values()].reduce((n, list) => n + list.length, 0);
    expect(total).toBe(MENU_CATALOG.length);
  });
});

describe("MODULE_KEY_TO_MENU_MODULE", () => {
  it("does not map SYSTEM (not user-assignable)", () => {
    expect(Object.values(MODULE_KEY_TO_MENU_MODULE)).not.toContain("SYSTEM");
  });
});

describe("display scope follows the resource's module, not the menu group", () => {
  // Regression: Projects renders under MASTERS but `construction.project`
  // lives in MODULE_TO_RESOURCES.project_mgmt. `modulesAssigned` is derived
  // from the resource side, so scoping the row by its menu group wiped a
  // just-saved tick on reload (and the next save revoked it for real).
  it("every catalog page's menu group agrees with its resource's module (or is overridden)", () => {
    for (const item of MENU_CATALOG) {
      const resource = MENU_TO_RESOURCE[item.key];
      if (!resource) continue;
      const owner = Object.entries(MODULE_TO_RESOURCES).find(([, list]) =>
        list.includes(resource),
      )?.[0];
      if (!owner) continue;
      const displayModule = MODULE_KEY_TO_MENU_MODULE[owner];
      // Either the groups line up, or buildModuleScopedMatrix keeps the row
      // in scope for the owning module — assert the latter behaviourally.
      if (displayModule !== item.module) {
        const scoped = buildModuleScopedMatrix([owner], {
          [item.key]: { add: true, edit: true, delete: true, view: true },
        });
        expect(scoped[item.key]?.view).toBe(true);
      }
    }
  });

  it("keeps a saved Projects grant when project_mgmt is assigned but masters is not", () => {
    const saved = buildDefaultMatrix(false);
    saved["master.project"] = { add: true, edit: true, delete: true, view: true };
    const scoped = buildModuleScopedMatrix(["project_mgmt"], saved);
    expect(scoped["master.project"]).toEqual({
      add: true,
      edit: true,
      delete: true,
      view: true,
    });
    // sibling MASTERS pages stay off — their resources belong to `masters`
    expect(scoped["master.item"]?.view).toBe(false);
  });

  it("scopes Projects to masters OR project_mgmt — a union, never a swap", () => {
    // masters is the page's own menu group: unchanged, still grants it.
    expect(buildMatrixFromModules(["masters"])["master.project"]?.view).toBe(true);
    // project_mgmt owns construction.project: now grants it too.
    expect(buildMatrixFromModules(["project_mgmt"])["master.project"]?.view).toBe(
      true,
    );
    // an unrelated module grants neither.
    expect(buildMatrixFromModules(["store"])["master.project"]?.view).toBe(false);
    // project_mgmt does NOT leak the rest of MASTERS.
    expect(buildMatrixFromModules(["project_mgmt"])["master.item"]?.view).toBe(
      false,
    );
  });
});
