import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

// Partial-mock permissions so we can drive the Edit-after-Finalize check while
// keeping every other export (forbidden, etc.) intact.
vi.mock("@/lib/api/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/permissions")>();
  return { ...actual, userCan: vi.fn() };
});

import { userCan } from "@/lib/api/permissions";
import { POST, PATCH } from "@/app/api/opsp/edit-log/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-opspedit-1";
const params = { params: {} as never };

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/opsp/edit-log", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function buildPATCH(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/opsp/edit-log", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asAuthed() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: "admin",
    status: "active",
  } as never);
}

const VALID = {
  year: 2026,
  quarter: "Q1",
  field: "employees.0",
  label: "Employees #1",
  oldValue: "Test 1",
  newValue: "Test 2",
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
  vi.mocked(userCan).mockReset();
});

describe("POST /api/opsp/edit-log — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(VALID), params);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/opsp/edit-log — guards", () => {
  beforeEach(asAuthed);

  it("returns 400 on invalid payload (missing field)", async () => {
    const res = await POST(buildPOST({ year: 2026, quarter: "Q1" }), params);
    expect(res.status).toBe(400);
  });

  it("returns 403 when the OPSP review is finalized (locked for everyone)", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: "opsp-1", status: "reviewed" } as never);

    const res = await POST(buildPOST(VALID), params);

    expect(res.status).toBe(403);
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the OPSP is still a draft", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: "opsp-1", status: "draft" } as never);

    const res = await POST(buildPOST(VALID), params);
    expect(res.status).toBe(409);
  });

  it("returns 403 when finalized but the user lacks Edit-after-Finalize", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: "opsp-1", status: "finalized" } as never);
    vi.mocked(userCan).mockResolvedValue(false);

    const res = await POST(buildPOST(VALID), params);

    expect(res.status).toBe(403);
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/opsp/edit-log — happy path", () => {
  beforeEach(asAuthed);

  it("writes an audit entry under the dedicated edit entityId", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: "opsp-1", status: "finalized" } as never);
    vi.mocked(userCan).mockResolvedValue(true);
    mockDb.auditLog.create.mockResolvedValue({} as never);

    const res = await POST(buildPOST({ ...VALID, note: "renamed lead" }), params);

    expect(res.status).toBe(201);
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    const data = (mockDb.auditLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data.entityType).toBe("OPSPData");
    expect(data.entityId).toBe("opsp-edit:opsp-1");
    expect(data.changes).toEqual(["employees.0"]);
    expect(data.reason).toBe("renamed lead");
  });
});

describe("PATCH /api/opsp/edit-log — edit note", () => {
  beforeEach(asAuthed);

  it("returns 403 when the OPSP review is finalized", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: "opsp-1", status: "reviewed" } as never);
    const res = await PATCH(buildPATCH({ year: 2026, quarter: "Q1", id: "log-1", note: "x" }), params);
    expect(res.status).toBe(403);
  });

  it("updates the note scoped to this OPSP's edit channel", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: "opsp-1", status: "finalized" } as never);
    vi.mocked(userCan).mockResolvedValue(true);
    mockDb.auditLog.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await PATCH(buildPATCH({ year: 2026, quarter: "Q1", id: "log-1", note: "updated" }), params);

    expect(res.status).toBe(200);
    const arg = mockDb.auditLog.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(arg.where.entityId).toBe("opsp-edit:opsp-1");
    expect(arg.where.id).toBe("log-1");
    expect(arg.data.reason).toBe("updated");
  });

  it("returns 404 when the entry isn't in this OPSP's channel", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: "opsp-1", status: "finalized" } as never);
    vi.mocked(userCan).mockResolvedValue(true);
    mockDb.auditLog.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await PATCH(buildPATCH({ year: 2026, quarter: "Q1", id: "nope", note: "x" }), params);
    expect(res.status).toBe(404);
  });
});
