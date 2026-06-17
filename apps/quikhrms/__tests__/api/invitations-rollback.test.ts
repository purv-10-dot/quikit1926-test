import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Dual-write compensation for POST /api/v1/hrms/invitations: when the central
 * QuikIT provision succeeds but the local Invitation insert fails, the central
 * provision must be rolled back (brand-new users only) so the two databases
 * don't drift — otherwise a retry can never re-issue the lost temp password.
 */

process.env.QUIKIT_URL = "http://localhost:3000";
delete process.env.NEXT_PUBLIC_QUIKIT_URL;
process.env.NEXT_PUBLIC_BASE_PATH = "";

// ── Mocks ────────────────────────────────────────────────────────────────
const dispatchInvitationEmail = vi.fn();
const provisionMemberRemote = vi.fn();
const deprovisionMemberRemote = vi.fn();
const createAuditLog = vi.fn();
const appRoleCount = vi.fn();
const employeeFindFirst = vi.fn();
const invitationFindFirst = vi.fn();
const invitationCreate = vi.fn();

vi.mock("@/lib/services/invitation", () => ({
  dispatchInvitationEmail: (...a: unknown[]) => dispatchInvitationEmail(...a),
}));
vi.mock("@/lib/utils/audit", () => ({ createAuditLog: (...a: unknown[]) => createAuditLog(...a) }));
vi.mock("@/lib/auth/invite-token", () => ({
  generateInviteToken: () => ({ hash: "fresh-hash", token: "raw-token" }),
  inviteExpiry: () => new Date("2026-07-11T00:00:00.000Z"),
}));
vi.mock("@quikit/auth/provision-member-remote", () => ({
  provisionMemberRemote: (...a: unknown[]) => provisionMemberRemote(...a),
}));
vi.mock("@quikit/auth/deprovision-member-remote", () => ({
  deprovisionMemberRemote: (...a: unknown[]) => deprovisionMemberRemote(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appRole: { count: (...a: unknown[]) => appRoleCount(...a) },
    employee: { findFirst: (...a: unknown[]) => employeeFindFirst(...a) },
    invitation: {
      findFirst: (...a: unknown[]) => invitationFindFirst(...a),
      create: (...a: unknown[]) => invitationCreate(...a),
    },
  },
}));
vi.mock("@/lib/with-auth", () => ({
  withAuth:
    (handler: (req: unknown, ctx: unknown, params: unknown) => Promise<unknown>) =>
    async (req: unknown, context: { params: Promise<unknown> }) =>
      handler(
        req,
        { orgId: "tenant-1", userId: "emp-admin", roles: ["admin"], permissions: ["*"], roleCode: "admin", mustChangePassword: false },
        await context.params,
      ),
}));

type RouteResponse = { status: number; json: () => Promise<{ success: boolean }> };
type PostFn = (req: unknown, ctx: { params: Promise<Record<string, string>> }) => Promise<RouteResponse>;

async function loadPost(): Promise<PostFn> {
  const mod = await import("@/app/api/v1/hrms/invitations/route");
  return mod.POST as unknown as PostFn;
}

function makeReq(body: unknown) {
  return { nextUrl: { origin: "http://localhost:3009", pathname: "/api/v1/hrms/invitations" }, method: "POST", json: async () => body };
}
const ctx = { params: Promise.resolve({}) };

const BODY = { email: "new.user@acme.com", firstName: "New", lastName: "User", roleIds: ["role-1"] };

describe("POST /invitations — central provision rollback on local failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    employeeFindFirst.mockResolvedValue(null); // no existing employee / inviter lookup
    invitationFindFirst.mockResolvedValue(null); // no pending invite
    appRoleCount.mockResolvedValue(1); // roleIds valid
    dispatchInvitationEmail.mockResolvedValue({ queued: true, sent: false });
    deprovisionMemberRemote.mockResolvedValue({ ok: true, removedUser: true });
  });

  it("rolls back a brand-new central user when the invitation insert fails", async () => {
    provisionMemberRemote.mockResolvedValue({
      ok: true, userId: "central-1", isNewUser: true, tempPassword: "Temp#1", invitationToken: "tok-1",
    });
    invitationCreate.mockRejectedValue(new Error("db down"));

    const POST = await loadPost();
    const res = await POST(makeReq(BODY), ctx);

    expect(res.status).toBe(500);
    expect(deprovisionMemberRemote).toHaveBeenCalledTimes(1);
    expect(deprovisionMemberRemote.mock.calls[0][0]).toMatchObject({
      orgId: "tenant-1", userId: "central-1", appSlug: "quikhrms",
    });
  });

  it("does not touch central for an existing (merely linked) user on local failure", async () => {
    provisionMemberRemote.mockResolvedValue({ ok: true, userId: "central-2", isNewUser: false });
    invitationCreate.mockRejectedValue(new Error("db down"));

    const POST = await loadPost();
    const res = await POST(makeReq(BODY), ctx);

    expect(res.status).toBe(500);
    expect(deprovisionMemberRemote).not.toHaveBeenCalled();
  });

  it("does not roll back on the happy path", async () => {
    provisionMemberRemote.mockResolvedValue({
      ok: true, userId: "central-1", isNewUser: true, tempPassword: "Temp#1", invitationToken: "tok-1",
    });
    invitationCreate.mockResolvedValue({ id: "inv-1" });
    employeeFindFirst
      .mockResolvedValueOnce(null) // existing-employee check
      .mockResolvedValueOnce({ firstName: "Admin", lastName: "Boss" }); // inviter

    const POST = await loadPost();
    const res = await POST(makeReq(BODY), ctx);

    expect(res.status).toBe(201);
    expect(deprovisionMemberRemote).not.toHaveBeenCalled();
  });
});
