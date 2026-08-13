import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { PermissionMatrix } from "@/types/permission";

const loadUserCrmGrants = vi.hoisted(() => vi.fn());
const isCrmRbacClientReady = vi.hoisted(() => vi.fn().mockReturnValue(true));
const findManyTemplates = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("@/lib/api/crm-rbac", () => ({ loadUserCrmGrants, isCrmRbacClientReady }));
vi.mock("@/lib/db", () => ({
  db: { qceUserPermissionTemplate: { findMany: findManyTemplates } },
}));

import { getEffectiveMatrix, assertModule } from "@/lib/auth/permissions";
import { SALES_USER_GRANTS } from "@/lib/auth/role-grants";

/** Actions granted on `module` by the resolved matrix. */
function actions(matrix: PermissionMatrix, module: string): string[] {
  return [...(matrix.find((r) => r.module === module)?.actions ?? [])].sort();
}

/** The RBAC grant list a user bound to the seeded `sales-user` role would have. */
const SALES_USER_RBAC = SALES_USER_GRANTS.map((g) => ({
  resource: g.resource,
  action: g.action,
}));

/** A deliberately narrowed role — view-only on leads, nothing else. */
const VIEW_ONLY_RBAC = [{ resource: "leads", action: "view" }];

beforeEach(() => {
  vi.clearAllMocks();
  isCrmRbacClientReady.mockReturnValue(true);
  findManyTemplates.mockResolvedValue([]);
  loadUserCrmGrants.mockResolvedValue(SALES_USER_RBAC);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.CRMEXPRESS_RBAC_MODE;
  vi.restoreAllMocks();
});

describe("shadow mode (default)", () => {
  it("serves the legacy union, so a narrowed role cannot restrict", async () => {
    loadUserCrmGrants.mockResolvedValue(VIEW_ONLY_RBAC);
    const matrix = await getEffectiveMatrix("u1", "org-1", "SalesUser");
    // Baseline still grants create/edit on leads despite the view-only role.
    expect(actions(matrix, "leads")).toContain("create");
  });

  it("logs the drift a flip would cause", async () => {
    loadUserCrmGrants.mockResolvedValue(VIEW_ONLY_RBAC);
    await getEffectiveMatrix("u1", "org-1", "SalesUser");
    const logged = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logged).toContain("[crm-rbac-shadow]");
    expect(logged).toContain("wouldLose=");
    expect(logged).toContain("leads:create");
  });

  it("stays silent when the bound role matches the baseline", async () => {
    // The safety property: seeded roles are built from the same *_GRANTS
    // constants the baseline uses, so a correctly-bound user shows no drift.
    await getEffectiveMatrix("u1", "org-1", "SalesUser");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("flags a user with no RBAC binding as unbound", async () => {
    loadUserCrmGrants.mockResolvedValue([]);
    await getEffectiveMatrix("u1", "org-1", "SalesUser");
    const logged = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logged).toContain("unbound=true");
  });
});

describe("authoritative mode", () => {
  beforeEach(() => {
    process.env.CRMEXPRESS_RBAC_MODE = "on";
  });

  it("lets a narrowed role actually restrict the user", async () => {
    loadUserCrmGrants.mockResolvedValue(VIEW_ONLY_RBAC);
    const matrix = await getEffectiveMatrix("u1", "org-1", "SalesUser");
    expect(actions(matrix, "leads")).toEqual(["view"]);
  });

  it("is identical to legacy for a correctly-bound user", async () => {
    const authoritative = await getEffectiveMatrix("u1", "org-1", "SalesUser");
    process.env.CRMEXPRESS_RBAC_MODE = "off";
    const legacy = await getEffectiveMatrix("u1", "org-1", "SalesUser");
    expect(actions(authoritative, "leads")).toEqual(actions(legacy, "leads"));
    expect(actions(authoritative, "accounts")).toEqual(actions(legacy, "accounts"));
  });

  it("falls back to legacy rather than locking out an unbound user", async () => {
    loadUserCrmGrants.mockResolvedValue([]);
    const matrix = await getEffectiveMatrix("u1", "org-1", "SalesUser");
    expect(actions(matrix, "leads")).toContain("create");
  });

  it("falls back to legacy when the RBAC delegates are unavailable", async () => {
    isCrmRbacClientReady.mockReturnValue(false);
    const matrix = await getEffectiveMatrix("u1", "org-1", "SalesUser");
    expect(actions(matrix, "leads")).toContain("create");
  });

  it("no longer lets an Administrator bypass the matrix", async () => {
    loadUserCrmGrants.mockResolvedValue(VIEW_ONLY_RBAC);
    const user = { userId: "u1", orgId: "org-1", role: "Administrator", email: "a@b.c", name: "A" };
    await expect(
      assertModule(user, "leads", "delete"),
    ).rejects.toThrow(/Forbidden/);
  });

  it("still allows an Administrator what their bound role grants", async () => {
    loadUserCrmGrants.mockResolvedValue(VIEW_ONLY_RBAC);
    const user = { userId: "u1", orgId: "org-1", role: "Administrator", email: "a@b.c", name: "A" };
    await expect(assertModule(user, "leads", "view")).resolves.toBeUndefined();
  });
});

describe("legacy mode", () => {
  beforeEach(() => {
    process.env.CRMEXPRESS_RBAC_MODE = "off";
  });

  it("keeps the Administrator short-circuit", async () => {
    loadUserCrmGrants.mockResolvedValue(VIEW_ONLY_RBAC);
    const user = { userId: "u1", orgId: "org-1", role: "Administrator", email: "a@b.c", name: "A" };
    await expect(assertModule(user, "leads", "delete")).resolves.toBeUndefined();
  });

  it("does no shadow logging", async () => {
    loadUserCrmGrants.mockResolvedValue(VIEW_ONLY_RBAC);
    await getEffectiveMatrix("u1", "org-1", "SalesUser");
    expect(console.warn).not.toHaveBeenCalled();
  });
});
