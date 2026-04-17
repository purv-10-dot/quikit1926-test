import { describe, it, expect } from "vitest";
import {
  MODULE_REGISTRY,
  ancestorsOf,
  isModuleEnabled,
  getAppConfig,
  visibleModules,
  findModuleByPath,
} from "../lib/moduleRegistry";

describe("ancestorsOf", () => {
  it("returns empty for top-level keys", () => {
    expect(ancestorsOf("kpi")).toEqual([]);
    expect(ancestorsOf("dashboard")).toEqual([]);
  });

  it("returns immediate parent for 2-level keys", () => {
    expect(ancestorsOf("kpi.teams")).toEqual(["kpi"]);
    expect(ancestorsOf("meetings.weekly")).toEqual(["meetings"]);
  });

  it("returns full chain for deeper keys", () => {
    expect(ancestorsOf("a.b.c")).toEqual(["a", "a.b"]);
    expect(ancestorsOf("a.b.c.d")).toEqual(["a", "a.b", "a.b.c"]);
  });
});

describe("isModuleEnabled (cascade rule)", () => {
  it("returns true when disabled set is empty", () => {
    expect(isModuleEnabled("kpi", new Set())).toBe(true);
    expect(isModuleEnabled("kpi.teams", new Set())).toBe(true);
  });

  it("returns false when the module itself is disabled", () => {
    expect(isModuleEnabled("kpi.teams", new Set(["kpi.teams"]))).toBe(false);
  });

  it("returns false when an ancestor is disabled", () => {
    expect(isModuleEnabled("kpi.teams", new Set(["kpi"]))).toBe(false);
    expect(isModuleEnabled("a.b.c", new Set(["a"]))).toBe(false);
    expect(isModuleEnabled("a.b.c", new Set(["a.b"]))).toBe(false);
  });

  it("returns true when a sibling is disabled but the path is clean", () => {
    expect(isModuleEnabled("kpi.individual", new Set(["kpi.teams"]))).toBe(true);
  });

  it("returns true when a descendant is disabled but the target is not", () => {
    // disabling a child doesn't hide its parent
    expect(isModuleEnabled("kpi", new Set(["kpi.teams"]))).toBe(true);
  });
});

describe("getAppConfig", () => {
  it("returns config for known app slugs", () => {
    expect(getAppConfig("quikscale")?.appSlug).toBe("quikscale");
    expect(getAppConfig("admin")?.appSlug).toBe("admin");
  });

  it("returns undefined for unknown slug", () => {
    expect(getAppConfig("nonexistent")).toBeUndefined();
  });
});

describe("visibleModules (cascade + filter)", () => {
  const app = getAppConfig("quikscale")!;

  it("returns all modules when nothing is disabled", () => {
    const result = visibleModules(app.modules, new Set());
    expect(result.length).toBe(app.modules.length);
  });

  it("hides a leaf module when it is disabled", () => {
    const result = visibleModules(app.modules, new Set(["kpi.teams"]));
    expect(result.find((m) => m.key === "kpi.teams")).toBeUndefined();
    // parent and sibling still visible
    expect(result.find((m) => m.key === "kpi")).toBeDefined();
    expect(result.find((m) => m.key === "kpi.individual")).toBeDefined();
  });

  it("cascades: disabling parent hides all children", () => {
    const result = visibleModules(app.modules, new Set(["kpi"]));
    expect(result.find((m) => m.key === "kpi")).toBeUndefined();
    expect(result.find((m) => m.key === "kpi.teams")).toBeUndefined();
    expect(result.find((m) => m.key === "kpi.individual")).toBeUndefined();
    // priority is unaffected
    expect(result.find((m) => m.key === "priority")).toBeDefined();
  });

  it("preserves registry order", () => {
    const result = visibleModules(app.modules, new Set(["kpi.teams"]));
    const keys = result.map((m) => m.key);
    const dashboardIdx = keys.indexOf("dashboard");
    const priorityIdx = keys.indexOf("priority");
    expect(dashboardIdx).toBeLessThan(priorityIdx);
  });
});

describe("findModuleByPath", () => {
  it("finds exact href match", () => {
    expect(findModuleByPath("quikscale", "/priority")?.key).toBe("priority");
  });

  it("finds module by path prefix", () => {
    expect(findModuleByPath("quikscale", "/kpi/teams/abc123")?.key).toBe("kpi.teams");
  });

  it("returns the most specific match (longest prefix wins)", () => {
    // /kpi matches both "kpi.individual" (href /kpi) and a hypothetical parent
    // The registry has kpi.individual with href /kpi, kpi.teams with /kpi/teams.
    // /kpi/teams should resolve to kpi.teams, not kpi.individual.
    expect(findModuleByPath("quikscale", "/kpi/teams")?.key).toBe("kpi.teams");
    expect(findModuleByPath("quikscale", "/kpi")?.key).toBe("kpi.individual");
  });

  it("returns undefined for unmatched paths", () => {
    expect(findModuleByPath("quikscale", "/nonexistent-route")).toBeUndefined();
  });

  it("returns undefined for unknown apps", () => {
    expect(findModuleByPath("nonexistent-app", "/anything")).toBeUndefined();
  });
});

describe("registry sanity", () => {
  it("every sub-module references a parent that exists", () => {
    for (const app of MODULE_REGISTRY) {
      const keys = new Set(app.modules.map((m) => m.key));
      for (const m of app.modules) {
        if (m.parentKey) {
          expect(keys.has(m.parentKey), `parent ${m.parentKey} missing for ${m.key}`).toBe(true);
        }
      }
    }
  });

  it("every parentKey matches the dot-prefix of the key", () => {
    for (const app of MODULE_REGISTRY) {
      for (const m of app.modules) {
        if (m.parentKey) {
          expect(m.key.startsWith(m.parentKey + "."), `${m.key} vs parent ${m.parentKey}`).toBe(true);
        }
      }
    }
  });

  it("keys are unique within each app", () => {
    for (const app of MODULE_REGISTRY) {
      const keys = app.modules.map((m) => m.key);
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    }
  });
});
