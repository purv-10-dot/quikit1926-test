import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendUserCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgSuspendedEmail: vi.fn().mockResolvedValue(undefined),
  sendMemberAddedEmail: vi.fn().mockResolvedValue(undefined),
}));

// bcrypt is slow; stub its hash to keep tests fast and deterministic.
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash: vi.fn().mockResolvedValue("hashed-password"),
  compare: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/super/orgs/[id]/members/route";
import { logAudit } from "@/lib/auditLog";
import { sendMemberAddedEmail } from "@/lib/email";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "t-1" } };

function postReq(body: unknown) {
  return makeRequest("http://localhost:3006/api/super/orgs/t-1/members", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  email: "new@acme.com",
  firstName: "New",
  lastName: "User",
  role: "member",
};

describe("POST /api/super/orgs/[id]/members", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(logAudit).mockClear();
    vi.mocked(sendMemberAddedEmail).mockClear();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await POST(postReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(postReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(postReq({ email: "new@acme.com", firstName: "New" }), PARAMS);
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toContain("required");
  });

  it("returns 400 when role is not in whitelist", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(postReq({ ...VALID_BODY, role: "superuser" }), PARAMS);
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toContain("owner, admin, member, or viewer");
  });

  it("returns 404 when org not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.tenant.findUnique.mockResolvedValue(null as never);
    mockDb.user.findUnique.mockResolvedValue(null as never);

    const res = await POST(postReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("Organization not found");
  });

  it("returns 409 when user is already an active member", async () => {
    setSession(SUPER_ADMIN);
    mockDb.tenant.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    mockDb.user.findUnique.mockResolvedValue({
      id: "u-1",
      email: "new@acme.com",
    } as never);
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m-1",
      status: "active",
    } as never);

    const res = await POST(postReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.error).toContain("already an active member");
  });

  it("creates new user and membership, returns 201", async () => {
    setSession(SUPER_ADMIN);
    mockDb.tenant.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    // user does not exist yet
    mockDb.user.findUnique.mockResolvedValue(null as never);
    mockDb.user.create.mockResolvedValue({
      id: "u-new",
      email: "new@acme.com",
      firstName: "New",
      lastName: "User",
    } as never);
    mockDb.membership.findUnique.mockResolvedValue(null as never);
    mockDb.membership.upsert.mockResolvedValue({
      id: "m-new",
      tenantId: "t-1",
      userId: "u-new",
      role: "member",
      status: "active",
      user: {
        id: "u-new",
        firstName: "New",
        lastName: "User",
        email: "new@acme.com",
      },
    } as never);

    const res = await POST(postReq(VALID_BODY), PARAMS);
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("m-new");

    expect(mockDb.user.create).toHaveBeenCalledTimes(1);
    expect(mockDb.membership.upsert).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "add_member",
        entityType: "membership",
        tenantId: "t-1",
      }),
    );
    expect(sendMemberAddedEmail).toHaveBeenCalledWith({
      to: "new@acme.com",
      orgName: "Acme",
      role: "member",
    });
  });

  it("reactivates membership for an existing user (no user.create)", async () => {
    setSession(SUPER_ADMIN);
    mockDb.tenant.findUnique.mockResolvedValue({ id: "t-1", name: "Acme" } as never);
    mockDb.user.findUnique.mockResolvedValue({
      id: "u-existing",
      email: "new@acme.com",
    } as never);
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m-old",
      status: "suspended",
    } as never);
    mockDb.membership.upsert.mockResolvedValue({
      id: "m-old",
      tenantId: "t-1",
      userId: "u-existing",
      role: "admin",
      status: "active",
      user: {
        id: "u-existing",
        firstName: "New",
        lastName: "User",
        email: "new@acme.com",
      },
    } as never);

    const res = await POST(postReq({ ...VALID_BODY, role: "admin" }), PARAMS);
    expect(res.status).toBe(201);
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockDb.membership.upsert).toHaveBeenCalledTimes(1);
  });
});
