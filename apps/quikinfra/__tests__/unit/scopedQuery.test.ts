import { describe, it, expect } from "vitest";
import { createScopedQuery, assertScopedPayload } from "@/lib/scoped-query";
import type { SecurityContext } from "@/lib/scoped-query";

const baseCtx: SecurityContext = {
  userId: "u1",
  tenantId: "t1",
  organizationId: "o1",
  role: "tenant_admin",
};

describe("createScopedQuery", () => {
  it("injects tenantId + orgId", () => {
    const where = createScopedQuery(baseCtx);
    expect(where).toMatchObject({ tenantId: "t1", orgId: "o1" });
  });
  it("merges extra where conditions", () => {
    const where = createScopedQuery(baseCtx, { status: "active" });
    expect(where).toMatchObject({ tenantId: "t1", orgId: "o1", status: "active" });
  });
  it("scopes site_admin to assigned projectIds", () => {
    const where = createScopedQuery({ ...baseCtx, role: "site_admin", projectIds: ["p1", "p2"] });
    expect(where.projectId).toEqual({ in: ["p1", "p2"] });
  });
  it("scopes plain user to assigned projectIds", () => {
    const where = createScopedQuery({ ...baseCtx, role: "user", projectIds: ["p9"] });
    expect(where.projectId).toEqual({ in: ["p9"] });
  });
  it("does NOT project-scope an admin even with projectIds", () => {
    const where = createScopedQuery({ ...baseCtx, role: "tenant_admin", projectIds: ["p1"] });
    expect(where.projectId).toBeUndefined();
  });
  it("does not project-scope when projectIds is empty", () => {
    const where = createScopedQuery({ ...baseCtx, role: "site_admin", projectIds: [] });
    expect(where.projectId).toBeUndefined();
  });
});

describe("assertScopedPayload", () => {
  it("strips client-sent scope fields and reapplies server context", () => {
    const out = assertScopedPayload(baseCtx, {
      name: "Item",
      tenantId: "evil-tenant",
      orgId: "evil-org",
      organizationId: "evil-org2",
    });
    expect(out).toEqual({ name: "Item", tenantId: "t1", orgId: "o1" });
  });
  it("preserves non-scope fields", () => {
    const out = assertScopedPayload(baseCtx, { a: 1, b: 2 });
    expect(out).toMatchObject({ a: 1, b: 2, tenantId: "t1", orgId: "o1" });
  });
});
