import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { requireAdmin } from "@/lib/api/requireAdmin";

const USER = "user-001";
const TENANT = "tenant-001";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("requireAdmin", () => {
  it("returns 401 error when no session", async () => {
    setSession(null);

    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result && result.error) {
      expect(result.error.status).toBe(401);
      const body = await result.error.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe("Unauthorized");
    }
  });

  it("returns 400 error when no tenantId in session", async () => {
    // Session without tenantId
    setSession({ id: USER, tenantId: "", role: "admin" });

    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result && result.error) {
      expect(result.error.status).toBe(400);
      const body = await result.error.json();
      expect(body.error).toBe("No organisation selected");
    }
  });

  it("returns 403 error when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);

    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result && result.error) {
      expect(result.error.status).toBe(403);
      const body = await result.error.json();
      expect(body.error).toBe("No active membership");
    }
  });

  it("returns 403 error when user role is below admin", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "employee" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "employee",
      status: "active",
    } as any);

    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result && result.error) {
      expect(result.error.status).toBe(403);
      const body = await result.error.json();
      expect(body.error).toBe("Admin access required");
    }
  });

  it("returns 403 error for manager role (below admin threshold)", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "manager" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "manager",
      status: "active",
    } as any);

    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    if ("error" in result && result.error) {
      expect(result.error.status).toBe(403);
    }
  });

  it("returns auth context when user is admin", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "admin",
      status: "active",
    } as any);

    const result = await requireAdmin();
    expect("error" in result && result.error).toBeFalsy();
    expect(result).toHaveProperty("userId", USER);
    expect(result).toHaveProperty("tenantId", TENANT);
    expect(result).toHaveProperty("session");
    expect(result).toHaveProperty("membership");
  });

  it("returns auth context when user is super_admin (above admin)", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "super_admin" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "super_admin",
      status: "active",
    } as any);

    const result = await requireAdmin();
    expect("error" in result && result.error).toBeFalsy();
    expect(result).toHaveProperty("userId", USER);
    expect(result).toHaveProperty("tenantId", TENANT);
  });
});
