import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * API tests for the canonical Qsp* role-management surface (/api/org/roles).
 * Covers: unauthorized (requireAdmin 403 passthrough), org-scoped happy path,
 * and duplicate-name conflict. Prisma + auth guard are mocked inline.
 */

const requireAdmin = vi.fn();
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: () => requireAdmin() }));

vi.mock("@/lib/api/seedAppRole", () => ({
  getQuikSupportAppId: vi.fn().mockResolvedValue("app_quiksupport_id"),
}));

const db = {
  qspAppRole: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
};
vi.mock("@/lib/db", () => ({ db, prisma: {} }));

import { GET, POST } from "@/app/api/org/roles/route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/org/roles", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/org/roles", () => {
  it("returns the guard's error response when the caller is not an admin", async () => {
    requireAdmin.mockResolvedValue({
      error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
    });

    const res = await GET();
    expect(res.status).toBe(403);
    expect(db.qspAppRole.findMany).not.toHaveBeenCalled();
  });

  it("lists roles scoped to the caller's org + the quiksupport app", async () => {
    requireAdmin.mockResolvedValue({ orgId: "orgA", userId: "u1" });
    db.qspAppRole.findMany.mockResolvedValue([{ id: "r1", name: "admin" }]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: [{ id: "r1", name: "admin" }] });
    expect(db.qspAppRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "orgA", appId: "app_quiksupport_id" } }),
    );
  });
});

describe("POST /api/org/roles", () => {
  it("creates a new role for the org (201)", async () => {
    requireAdmin.mockResolvedValue({ orgId: "orgA", userId: "u1" });
    db.qspAppRole.findUnique.mockResolvedValue(null);
    db.qspAppRole.create.mockResolvedValue({ id: "r2", name: "Agents", isSystem: false });

    const res = await POST(postReq({ name: "Agents" }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(db.qspAppRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "orgA", appId: "app_quiksupport_id", name: "Agents" }),
      }),
    );
  });

  it("rejects a duplicate role name with 409", async () => {
    requireAdmin.mockResolvedValue({ orgId: "orgA", userId: "u1" });
    db.qspAppRole.findUnique.mockResolvedValue({ id: "existing" });

    const res = await POST(postReq({ name: "admin" }));
    expect(res.status).toBe(409);
    expect(db.qspAppRole.create).not.toHaveBeenCalled();
  });
});
