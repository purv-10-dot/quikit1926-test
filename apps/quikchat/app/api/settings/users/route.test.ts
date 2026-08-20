import { describe, it, expect, beforeEach, vi } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../../../__tests__/helpers/mockDb";

vi.mock("@/lib/authz/requireAdmin", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/authz/permissions", () => ({
  getQuikChatAppId: vi.fn(async () => "app-qc"),
}));
vi.mock("@/lib/authz/seed", () => ({
  seedAllDefaultRoles: vi.fn(async () => null),
}));
vi.mock("@quikit/auth/assign-app-roles", () => ({
  assignAppRoles: vi.fn(async () => undefined),
}));
vi.mock("@quikit/shared/sso-domain-server", () => ({
  classifySsoProviderAsync: vi.fn(async () => null),
}));
vi.mock("@quikit/shared/temp-password", () => ({
  generateTempPassword: vi.fn(() => "Temp-Pass-123!"),
}));
vi.mock("@quikit/shared", () => ({
  renderInvitationEmail: vi.fn(() => ({ subject: "Invite", html: "<p>hi</p>" })),
}));
vi.mock("@/lib/email/mailer", () => ({
  sendMail: vi.fn(async () => ({ success: true, messageId: "mid-1" })),
}));

import { requireAdmin } from "@/lib/authz/requireAdmin";
import { assignAppRoles } from "@quikit/auth/assign-app-roles";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { sendMail } from "@/lib/email/mailer";
import type { NextRequest } from "next/server";
import { GET, POST } from "./route";

const ORG = "org-1";
const gate = requireAdmin as unknown as ReturnType<typeof vi.fn>;

function post(body: unknown): NextRequest {
  return new Request("http://test.local/api/settings/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resetMockDb();
  vi.clearAllMocks();
  gate.mockResolvedValue({ orgId: ORG, userId: "inviter-1" });
});

describe("GET /api/settings/users", () => {
  it("401/403s when the caller is not an admin", async () => {
    const denied = { error: Response.json({ error: "nope" }, { status: 403 }) };
    gate.mockResolvedValue(denied);

    const res = (await GET())!;
    expect(res).toBe(denied.error);
  });

  it("returns an empty list when nobody has QuikChat access yet", async () => {
    mockDb.userAppAccess.findMany.mockResolvedValue([] as never);

    const res = (await GET())!;
    const json = await res.json();
    expect(json).toEqual({ success: true, data: [] });
  });

  it("marks a user pending until they accept or sign in", async () => {
    mockDb.userAppAccess.findMany.mockResolvedValue([
      { userId: "u1", role: "Member", grantedAt: new Date("2026-01-01") },
    ] as never);
    mockDb.orgMember.findMany.mockResolvedValue([
      {
        userId: "u1",
        invitedAt: new Date("2026-01-01"),
        acceptedAt: null,
        inviteMethod: "native",
        inviteProvider: null,
      },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", email: "a@b.com", firstName: "A", lastName: "B", lastSignInAt: null },
    ] as never);
    mockDb.qcUserAppRole.findMany.mockResolvedValue([] as never);

    const res = (await GET())!;
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual([
      expect.objectContaining({ id: "u1", status: "pending", role: "Member" }),
    ]);
  });
});

describe("POST /api/settings/users — invite a new person", () => {
  const validBody = {
    firstName: "Priya",
    lastName: "Sharma",
    email: "priya@example.com",
    roleId: "role-1",
    invitationMethod: "native",
  };

  beforeEach(() => {
    mockDb.qcAppRole.findFirst.mockResolvedValue({ id: "role-1", name: "Member" } as never);
    mockDb.user.findUnique.mockResolvedValue(null as never); // brand-new invitee
    mockDb.user.upsert.mockResolvedValue({ id: "new-user-1" } as never);
    mockDb.orgMember.upsert.mockResolvedValue({} as never);
    mockDb.userAppAccess.findFirst.mockResolvedValue(null as never);
    mockDb.userAppAccess.create.mockResolvedValue({} as never);
    mockDb.org.findUnique.mockResolvedValue({ name: "Acme", brandColor: null } as never);
    mockDb.app.findUnique.mockResolvedValue({ name: "QuikChat" } as never);
  });

  it("401/403s when the caller is not an admin", async () => {
    const denied = { error: Response.json({ error: "nope" }, { status: 403 }) };
    gate.mockResolvedValue(denied);

    const res = (await POST(post(validBody)))!;
    expect(res).toBe(denied.error);
  });

  it("creates the user + membership + access, assigns the role, and emails the invite", async () => {
    const res = (await POST(post(validBody)))!;
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.invite.tempPassword).toBe("Temp-Pass-123!");
    expect(json.data.invite.mail).toEqual({ sent: true, error: null });

    expect(mockDb.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "priya@example.com" },
        create: expect.objectContaining({ mustChangePassword: true }),
      }),
    );
    expect(mockDb.orgMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_userId: { orgId: ORG, userId: "new-user-1" } },
      }),
    );
    expect(mockDb.userAppAccess.create).toHaveBeenCalledWith({
      data: { userId: "new-user-1", orgId: ORG, appId: "app-qc", role: "Member", grantedBy: "inviter-1" },
    });
    expect(assignAppRoles).toHaveBeenCalledWith(mockDb, ORG, [
      { userId: "new-user-1", appId: "app-qc", roleName: "Member" },
    ]);
    expect(sendMail).toHaveBeenCalled();
  });

  it("400s on an unknown role id", async () => {
    mockDb.qcAppRole.findFirst.mockResolvedValue(null as never);

    const res = (await POST(post(validBody)))!;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown role/i);
  });

  it("422s an SSO invite whose domain isn't Google/Microsoft", async () => {
    (classifySsoProviderAsync as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = (await POST(post({ ...validBody, invitationMethod: "sso" })))!;
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/google or microsoft/i);
  });

  it("409s when the invitee already has QuikChat access in this org", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "existing-1" } as never);
    mockDb.orgMember.findUnique.mockResolvedValue({ id: "member-1", inviteAppIds: [] } as never);
    mockDb.userAppAccess.findFirst.mockResolvedValue({ id: "access-1" } as never);

    const res = (await POST(post(validBody)))!;
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already has quikchat access/i);
  });
});
