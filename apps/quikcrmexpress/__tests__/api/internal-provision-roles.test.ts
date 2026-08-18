import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const seedAllDefaultCrmRoles = vi.hoisted(() => vi.fn());
const ensureUserOnCrmRole = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/api/seed-crm-app-roles", () => ({ seedAllDefaultCrmRoles }));
vi.mock("@/lib/api/crm-rbac", () => ({ ensureUserOnCrmRole }));

import { POST } from "@/app/api/internal/provision-roles/route";

const SECRET = "test-internal-secret";

function post(body: unknown, secret?: string): NextRequest {
  return new NextRequest("http://localhost/api/internal/provision-roles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-internal-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/internal/provision-roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_SECRET = SECRET;
    seedAllDefaultCrmRoles.mockResolvedValue({
      adminRoleId: "role-admin",
      defaultRoleId: "role-sales-user",
    });
  });

  afterEach(() => {
    delete process.env.INTERNAL_SECRET;
  });

  it("401s without the internal secret", async () => {
    const res = await POST(post({ orgId: "org-1" }));
    expect(res.status).toBe(401);
    expect(seedAllDefaultCrmRoles).not.toHaveBeenCalled();
  });

  it("401s on a wrong secret", async () => {
    const res = await POST(post({ orgId: "org-1" }, "wrong"));
    expect(res.status).toBe(401);
    expect(seedAllDefaultCrmRoles).not.toHaveBeenCalled();
  });

  it("401s when INTERNAL_SECRET is unset on the server, even if a header is sent", async () => {
    delete process.env.INTERNAL_SECRET;
    const res = await POST(post({ orgId: "org-1" }, "anything"));
    expect(res.status).toBe(401);
  });

  it("400s when orgId is missing", async () => {
    const res = await POST(post({}, SECRET));
    expect(res.status).toBe(400);
    expect(seedAllDefaultCrmRoles).not.toHaveBeenCalled();
  });

  it("seeds the org's roles and binds the supplied admins to the admin role", async () => {
    const res = await POST(
      post({ orgId: "org-1", adminUserIds: ["u1", "u2"] }, SECRET),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      adminRoleId: "role-admin",
      defaultRoleId: "role-sales-user",
      assignedAdminUserIds: ["u1", "u2"],
    });
    expect(seedAllDefaultCrmRoles).toHaveBeenCalledWith("org-1");
    expect(ensureUserOnCrmRole).toHaveBeenCalledWith("u1", "org-1", "role-admin");
    expect(ensureUserOnCrmRole).toHaveBeenCalledWith("u2", "org-1", "role-admin");
  });

  it("seeds roles with no admins to bind — the Admin Portal dropdown case", async () => {
    const res = await POST(post({ orgId: "org-1" }, SECRET));
    expect(res.status).toBe(200);
    expect(seedAllDefaultCrmRoles).toHaveBeenCalledWith("org-1");
    expect(ensureUserOnCrmRole).not.toHaveBeenCalled();
  });

  it("does not seed another org's roles", async () => {
    await POST(post({ orgId: "org-2", adminUserIds: ["u1"] }, SECRET));
    expect(seedAllDefaultCrmRoles).toHaveBeenCalledWith("org-2");
    expect(seedAllDefaultCrmRoles).not.toHaveBeenCalledWith("org-1");
    expect(ensureUserOnCrmRole).toHaveBeenCalledWith("u1", "org-2", "role-admin");
  });

  it("500s with the seeder's message when the App row is missing", async () => {
    seedAllDefaultCrmRoles.mockRejectedValue(
      new Error("CrmExpress App not registered in quikit.App"),
    );
    const res = await POST(post({ orgId: "org-1" }, SECRET));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "CrmExpress App not registered in quikit.App",
    });
  });
});
