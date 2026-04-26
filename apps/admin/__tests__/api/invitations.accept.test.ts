import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
  },
  hash: vi.fn().mockResolvedValue("hashed-password"),
}));

import { GET, POST } from "@/app/api/invitations/accept/route";

const TENANT = "tenant-001";

function buildRequest(method: string, url: string, body?: object): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(`http://localhost${url}`, init as never);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/invitations/accept", () => {
  it("returns 400 when token is missing", async () => {
    const res = await GET(buildRequest("GET", "/api/invitations/accept"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown token", async () => {
    mockDb.membership.findUnique.mockResolvedValue(null);
    const res = await GET(
      buildRequest("GET", "/api/invitations/accept?token=missing")
    );
    expect(res.status).toBe(404);
  });

  it("returns 410 for expired invitation (>7 days old)", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m1",
      tenantId: TENANT,
      status: "invited",
      invitationToken: "tok",
      invitedAt: eightDaysAgo,
      role: "employee",
      tenant: { name: "Acme", logoUrl: null, brandColor: null },
      user: { email: "x@y.com", firstName: "X", lastName: "Y", password: null },
    } as any);

    const res = await GET(
      buildRequest("GET", "/api/invitations/accept?token=tok")
    );
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
  });

  it("returns 400 when invitation already accepted", async () => {
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m1",
      tenantId: TENANT,
      status: "active",
      invitationToken: "tok",
      invitedAt: new Date(),
      role: "employee",
      tenant: { name: "Acme", logoUrl: null, brandColor: null },
      user: { email: "x@y.com", firstName: "X", lastName: "Y", password: "hash" },
    } as any);

    const res = await GET(
      buildRequest("GET", "/api/invitations/accept?token=tok")
    );
    expect(res.status).toBe(400);
  });

  it("returns invitation details for valid token (needsPassword=true)", async () => {
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m1",
      tenantId: TENANT,
      status: "invited",
      invitationToken: "tok",
      invitedAt: new Date(),
      role: "employee",
      tenant: { name: "Acme", logoUrl: null, brandColor: "#abc123" },
      user: { email: "x@y.com", firstName: "X", lastName: "Y", password: null },
    } as any);

    const res = await GET(
      buildRequest("GET", "/api/invitations/accept?token=tok")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("x@y.com");
    expect(body.data.needsPassword).toBe(true);
    expect(body.data.orgName).toBe("Acme");
  });
});

describe("POST /api/invitations/accept", () => {
  it("activates membership and writes ACCEPTED audit log", async () => {
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m1",
      tenantId: TENANT,
      status: "invited",
      invitedAt: new Date(),
      createdBy: "admin-1",
      user: { id: "u1", password: null },
    } as any);
    mockDb.user.update.mockResolvedValue({} as any);
    mockDb.membership.update.mockResolvedValue({} as any);
    mockDb.app.findMany.mockResolvedValue([]);

    const res = await POST(
      buildRequest("POST", "/api/invitations/accept", {
        token: "tok",
        password: "supersecret",
      })
    );
    expect(res.status).toBe(200);
    expect(mockDb.user.update).toHaveBeenCalled();
    expect(mockDb.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "active" }),
      })
    );
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ACCEPTED",
          entityType: "Membership",
        }),
      })
    );
  });

  it("rejects short password", async () => {
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m1",
      tenantId: TENANT,
      status: "invited",
      invitedAt: new Date(),
      user: { id: "u1", password: null },
    } as any);

    const res = await POST(
      buildRequest("POST", "/api/invitations/accept", {
        token: "tok",
        password: "short",
      })
    );
    expect(res.status).toBe(400);
  });
});
