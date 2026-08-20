import { describe, it, expect, beforeEach, vi } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../../../../../__tests__/helpers/mockDb";

vi.mock("@/lib/authz/requireAdmin", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/authz/permissions", () => ({
  getQuikChatAppId: vi.fn(async () => "app-qc"),
}));
vi.mock("@quikit/shared", () => ({
  renderInvitationEmail: vi.fn(() => ({ subject: "Reminder", html: "<p>hi</p>" })),
}));
vi.mock("@/lib/email/mailer", () => ({
  sendMail: vi.fn(async () => ({ success: true, messageId: "mid-1" })),
}));

import { requireAdmin } from "@/lib/authz/requireAdmin";
import { sendMail } from "@/lib/email/mailer";
import type { NextRequest } from "next/server";
import { POST } from "./route";

const ORG = "org-1";
const gate = requireAdmin as unknown as ReturnType<typeof vi.fn>;

function req(): NextRequest {
  return new Request("http://test.local/api/settings/users/u1/resend-invite", {
    method: "POST",
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resetMockDb();
  vi.clearAllMocks();
  gate.mockResolvedValue({ orgId: ORG, userId: "inviter-1" });
  mockDb.user.findUnique.mockResolvedValue({
    id: "u1",
    email: "pending@example.com",
    firstName: "Pat",
    lastName: "Doe",
  } as never);
  mockDb.userAppAccess.findFirst.mockResolvedValue({ id: "access-1" } as never);
  mockDb.orgMember.findUnique.mockResolvedValue({
    acceptedAt: null,
    inviteMethod: "native",
    inviteProvider: null,
  } as never);
  mockDb.orgMember.update.mockResolvedValue({} as never);
  mockDb.qcUserAppRole.findFirst.mockResolvedValue({ role: { name: "Member" } } as never);
  mockDb.org.findUnique.mockResolvedValue({ name: "Acme", brandColor: null } as never);
  mockDb.app.findUnique.mockResolvedValue({ name: "QuikChat" } as never);
});

describe("POST /api/settings/users/[id]/resend-invite", () => {
  it("401/403s when the caller is not an admin", async () => {
    const denied = { error: Response.json({ error: "nope" }, { status: 403 }) };
    gate.mockResolvedValue(denied);

    const res = (await POST(req(), { params: { id: "u1" } }))!;
    expect(res).toBe(denied.error);
  });

  it("404s when the user has no QuikChat access in this org", async () => {
    mockDb.userAppAccess.findFirst.mockResolvedValue(null as never);

    const res = (await POST(req(), { params: { id: "u1" } }))!;
    expect(res.status).toBe(404);
  });

  it("409s when the invite was already accepted", async () => {
    mockDb.orgMember.findUnique.mockResolvedValue({
      acceptedAt: new Date(),
      inviteMethod: "native",
      inviteProvider: null,
    } as never);

    const res = (await POST(req(), { params: { id: "u1" } }))!;
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already accepted/i);
  });

  it("rotates the token and re-sends the invitation email", async () => {
    const res = (await POST(req(), { params: { id: "u1" } }))!;
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.invite.mail).toEqual({ sent: true, error: null });
    expect(json.data.invite.url).toContain("/invitations/accept?token=");

    expect(mockDb.orgMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_userId: { orgId: ORG, userId: "u1" } },
        data: expect.objectContaining({ invitationToken: expect.any(String) }),
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "pending@example.com" }),
    );
  });
});
