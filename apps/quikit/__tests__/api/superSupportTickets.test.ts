import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

import { GET as LIST } from "@/app/api/super/support-tickets/route";
import { GET as DETAIL, PATCH } from "@/app/api/super/support-tickets/[id]/route";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "tk-1" } };

const BASE_TICKET = {
  id: "tk-1",
  ticketNo: 1,
  orgId: "org-1",
  userId: "user-9",
  appId: "app-1",
  appSlug: "quikscale",
  roleName: "member",
  subject: "Cannot open KPI",
  description: "500 on load",
  requestType: "bug",
  status: "open",
  priority: "medium",
  adminResponse: null,
  respondedById: null,
  respondedAt: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  org: { name: "Acme", slug: "acme" },
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ─── GET /api/super/support-tickets ──────────────────────────────────────────

describe("GET /api/super/support-tickets", () => {
  it("returns 401 without session", async () => {
    const res = await LIST(makeRequest("http://localhost:3006/api/super/support-tickets"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await LIST(makeRequest("http://localhost:3006/api/super/support-tickets"));
    expect(res.status).toBe(403);
  });

  it("lists tickets across orgs with no orgId isolation predicate", async () => {
    setSession(SUPER_ADMIN);
    mockDb.supportTicket.findMany.mockResolvedValue([BASE_TICKET] as any);
    mockDb.supportTicket.count.mockResolvedValue(1 as any);
    mockDb.user.findMany.mockResolvedValue([
      { id: "user-9", firstName: "Ada", lastName: "Lovelace", email: "ada@acme.test" },
    ] as any);

    const res = await LIST(makeRequest("http://localhost:3006/api/super/support-tickets"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].orgName).toBe("Acme");
    expect(body.data[0].requesterName).toBe("Ada Lovelace");

    // Cross-org by design — this is the sanctioned super-admin surface.
    const where = mockDb.supportTicket.findMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.orgId).toBeUndefined();
  });

  it("applies app / org / type / status filters", async () => {
    setSession(SUPER_ADMIN);
    mockDb.supportTicket.findMany.mockResolvedValue([] as any);
    mockDb.supportTicket.count.mockResolvedValue(0 as any);

    await LIST(
      makeRequest(
        "http://localhost:3006/api/super/support-tickets?appSlug=quikscale&orgId=org-1&requestType=bug&status=open",
      ),
    );

    const where = mockDb.supportTicket.findMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({
      appSlug: "quikscale",
      orgId: "org-1",
      requestType: "bug",
      status: "open",
    });
  });

  it("ignores an unknown status filter rather than passing it to Prisma", async () => {
    setSession(SUPER_ADMIN);
    mockDb.supportTicket.findMany.mockResolvedValue([] as any);
    mockDb.supportTicket.count.mockResolvedValue(0 as any);

    await LIST(makeRequest("http://localhost:3006/api/super/support-tickets?status=bogus"));

    const where = mockDb.supportTicket.findMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.status).toBeUndefined();
  });
});

// ─── GET /api/super/support-tickets/[id] ─────────────────────────────────────

describe("GET /api/super/support-tickets/[id]", () => {
  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await DETAIL(
      makeRequest("http://localhost:3006/api/super/support-tickets/tk-1"),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("404s for a missing ticket", async () => {
    setSession(SUPER_ADMIN);
    mockDb.supportTicket.findUnique.mockResolvedValue(null as any);
    const res = await DETAIL(
      makeRequest("http://localhost:3006/api/super/support-tickets/tk-1"),
      PARAMS,
    );
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/super/support-tickets/[id] ───────────────────────────────────

describe("PATCH /api/super/support-tickets/[id]", () => {
  function patchRequest(body: unknown) {
    return makeRequest("http://localhost:3006/api/super/support-tickets/tk-1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await PATCH(patchRequest({ status: "in_progress" }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("rejects an empty update with 400", async () => {
    setSession(SUPER_ADMIN);
    const res = await PATCH(patchRequest({}), PARAMS);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid status with 400", async () => {
    setSession(SUPER_ADMIN);
    const res = await PATCH(patchRequest({ status: "bogus" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("rejects an illegal transition (closed → in_progress) with 400", async () => {
    setSession(SUPER_ADMIN);
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: "tk-1",
      orgId: "org-1",
      status: "closed",
    } as any);

    const res = await PATCH(patchRequest({ status: "in_progress" }), PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("closed");
  });

  it("404s for a missing ticket", async () => {
    setSession(SUPER_ADMIN);
    mockDb.supportTicket.findUnique.mockResolvedValue(null as any);
    const res = await PATCH(patchRequest({ status: "in_progress" }), PARAMS);
    expect(res.status).toBe(404);
  });

  it("updates status + response and records a status-history message", async () => {
    setSession(SUPER_ADMIN);
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: "tk-1",
      orgId: "org-1",
      status: "open",
    } as any);
    mockDb.supportTicket.update.mockResolvedValue({
      ...BASE_TICKET,
      status: "in_progress",
    } as any);
    mockDb.supportTicketMessage.create.mockResolvedValue({ id: "m1" } as any);
    // The route wraps both writes in an interactive transaction.
    (mockDb as any).$transaction.mockImplementation(async (fn: any) => fn(mockDb));

    const res = await PATCH(
      patchRequest({ status: "in_progress", adminResponse: "On it." }),
      PARAMS,
    );
    expect(res.status).toBe(200);

    const updateData = mockDb.supportTicket.update.mock.calls[0][0]!.data as Record<string, unknown>;
    expect(updateData.status).toBe("in_progress");
    expect(updateData.adminResponse).toBe("On it.");
    expect(updateData.respondedById).toBe("sa-1");

    const msgData = mockDb.supportTicketMessage.create.mock.calls[0][0]!.data as Record<
      string,
      unknown
    >;
    expect(msgData.authorRole).toBe("super_admin");
    expect(msgData.statusFrom).toBe("open");
    expect(msgData.statusTo).toBe("in_progress");
  });

  it("stamps resolvedAt when moving to resolved", async () => {
    setSession(SUPER_ADMIN);
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: "tk-1",
      orgId: "org-1",
      status: "in_progress",
    } as any);
    mockDb.supportTicket.update.mockResolvedValue({ ...BASE_TICKET, status: "resolved" } as any);
    mockDb.supportTicketMessage.create.mockResolvedValue({ id: "m1" } as any);
    (mockDb as any).$transaction.mockImplementation(async (fn: any) => fn(mockDb));

    const res = await PATCH(patchRequest({ status: "resolved" }), PARAMS);
    expect(res.status).toBe(200);

    const updateData = mockDb.supportTicket.update.mock.calls[0][0]!.data as Record<string, unknown>;
    expect(updateData.resolvedAt).toBeInstanceOf(Date);
  });

  it("clears resolvedAt/closedAt when a ticket is reopened", async () => {
    setSession(SUPER_ADMIN);
    mockDb.supportTicket.findUnique.mockResolvedValue({
      id: "tk-1",
      orgId: "org-1",
      status: "closed",
    } as any);
    mockDb.supportTicket.update.mockResolvedValue({ ...BASE_TICKET, status: "reopened" } as any);
    mockDb.supportTicketMessage.create.mockResolvedValue({ id: "m1" } as any);
    (mockDb as any).$transaction.mockImplementation(async (fn: any) => fn(mockDb));

    const res = await PATCH(patchRequest({ status: "reopened" }), PARAMS);
    expect(res.status).toBe(200);

    const updateData = mockDb.supportTicket.update.mock.calls[0][0]!.data as Record<string, unknown>;
    expect(updateData.resolvedAt).toBeNull();
    expect(updateData.closedAt).toBeNull();
  });
});
