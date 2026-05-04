import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { getOrgId } from "@/lib/api/getOrgId";

const USER = "user-001";
const TENANT = "tenant-001";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("getOrgId", () => {
  it("returns orgId from session when session has orgId and active membership", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);
    // Mock app lookup for appSlug check
    mockDb.app.findUnique.mockResolvedValue({
      id: "app1",
      slug: "admin-portal",
    } as any);
    mockDb.userAppAccess.findUnique.mockResolvedValue({
      userId: USER,
      orgId: TENANT,
      appId: "app1",
    } as any);

    const result = await getOrgId(USER);
    expect(result).toBe(TENANT);
  });

  it("returns null when session has orgId but no active membership", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);

    const result = await getOrgId(USER);
    expect(result).toBeNull();
  });

  it("returns null when session has orgId but no app access", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);
    mockDb.app.findUnique.mockResolvedValue({
      id: "app1",
      slug: "admin-portal",
    } as any);
    mockDb.userAppAccess.findUnique.mockResolvedValue(null);

    const result = await getOrgId(USER);
    expect(result).toBeNull();
  });

  it("returns orgId from first membership when session has no orgId", async () => {
    setSession({ id: USER, orgId: "", role: "admin" });
    // When orgId is falsy, it falls through to membership lookup
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);

    const result = await getOrgId(USER);
    expect(result).toBe(TENANT);
  });

  it("returns null when no session", async () => {
    setSession(null);

    const result = await getOrgId(USER);
    // With no session, getServerSession returns null, so orgId is undefined/falsy
    // Falls through to membership lookup
    // But since we haven't mocked it, mockDb returns undefined -> null
    expect(result).toBeNull();
  });
});
