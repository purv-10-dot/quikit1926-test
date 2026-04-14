import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { getTenantId } from "@/lib/api/getTenantId";

const USER = "user-001";
const TENANT = "tenant-001";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("getTenantId", () => {
  it("returns tenantId from session when session has tenantId and active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      status: "active",
    } as any);
    // Mock app lookup for appSlug check
    mockDb.app.findUnique.mockResolvedValue({
      id: "app1",
      slug: "admin-portal",
    } as any);
    mockDb.userAppAccess.findUnique.mockResolvedValue({
      userId: USER,
      tenantId: TENANT,
      appId: "app1",
    } as any);

    const result = await getTenantId(USER);
    expect(result).toBe(TENANT);
  });

  it("returns null when session has tenantId but no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);

    const result = await getTenantId(USER);
    expect(result).toBeNull();
  });

  it("returns null when session has tenantId but no app access", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      status: "active",
    } as any);
    mockDb.app.findUnique.mockResolvedValue({
      id: "app1",
      slug: "admin-portal",
    } as any);
    mockDb.userAppAccess.findUnique.mockResolvedValue(null);

    const result = await getTenantId(USER);
    expect(result).toBeNull();
  });

  it("returns tenantId from first membership when session has no tenantId", async () => {
    setSession({ id: USER, tenantId: "", role: "admin" });
    // When tenantId is falsy, it falls through to membership lookup
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      status: "active",
    } as any);

    const result = await getTenantId(USER);
    expect(result).toBe(TENANT);
  });

  it("returns null when no session", async () => {
    setSession(null);

    const result = await getTenantId(USER);
    // With no session, getServerSession returns null, so tenantId is undefined/falsy
    // Falls through to membership lookup
    // But since we haven't mocked it, mockDb returns undefined -> null
    expect(result).toBeNull();
  });
});
