import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression test for POST /api/v1/hrms/invitations/:id/resend.
 *
 * Bug: resend never passed `setupUrl` to the invitation email, so a resent
 * invite for a brand-new native user always fell back to the /login link
 * instead of the central accept link (`…/invitations/accept?token=…`). The fix
 * persists the central token on the Invitation row at create time and rebuilds
 * the same accept link on resend.
 *
 * Fails before the fix (setupUrl undefined/absent), passes after.
 */

// The central base the route reads at module load to build the accept link.
// Must be set BEFORE the route is dynamically imported below.
process.env.QUIKIT_URL = "http://localhost:3000";
delete process.env.NEXT_PUBLIC_QUIKIT_URL;
process.env.NEXT_PUBLIC_BASE_PATH = "";

// ── Mocks for every @/lib dependency the resend route pulls in ──────────────
const dispatchInvitationEmail = vi.fn();
const createAuditLog = vi.fn();
const findFirstInvitation = vi.fn();
const updateInvitation = vi.fn();
const findFirstEmployee = vi.fn();

vi.mock("@/lib/services/invitation", () => ({
  dispatchInvitationEmail: (...args: unknown[]) => dispatchInvitationEmail(...args),
}));
vi.mock("@/lib/utils/audit", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLog(...args),
}));
vi.mock("@/lib/auth/invite-token", () => ({
  generateInviteToken: () => ({ hash: "fresh-hash", token: "raw-token" }),
  inviteExpiry: () => new Date("2026-06-11T00:00:00.000Z"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invitation: {
      findFirst: (...a: unknown[]) => findFirstInvitation(...a),
      update: (...a: unknown[]) => updateInvitation(...a),
    },
    employee: { findFirst: (...a: unknown[]) => findFirstEmployee(...a) },
  },
}));
// Bypass real JWT/RBAC: invoke the wrapped handler directly with an admin ctx.
vi.mock("@/lib/with-auth", () => ({
  withAuth:
    (handler: (req: unknown, ctx: unknown, params: unknown) => Promise<unknown>) =>
    async (req: unknown, context: { params: Promise<unknown> }) =>
      handler(
        req,
        {
          orgId: "tenant-1",
          userId: "emp-admin",
          roles: ["admin"],
          permissions: ["*"],
          roleCode: "admin",
          mustChangePassword: false,
        },
        await context.params,
      ),
}));

type RouteResponse = { status: number; json: () => Promise<unknown> };
type PostFn = (req: unknown, ctx: { params: Promise<{ id: string }> }) => Promise<RouteResponse>;

async function loadPost(): Promise<PostFn> {
  const mod = await import("@/app/api/v1/hrms/invitations/[id]/resend/route");
  return mod.POST as unknown as PostFn;
}

function makeReq() {
  return { nextUrl: { origin: "http://localhost:3009" }, method: "POST" };
}
function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const baseInvite = {
  id: "inv-1",
  orgId: "tenant-1",
  email: "new.user@acme.com",
  firstName: "New",
  lastName: "User",
  status: "Pending",
};

describe("POST /invitations/:id/resend — accept-link regression", () => {
  beforeEach(() => {
    updateInvitation.mockResolvedValue({});
    findFirstEmployee.mockResolvedValue({ firstName: "Admin", lastName: "Boss" });
    dispatchInvitationEmail.mockResolvedValue({ queued: true, sent: false });
  });

  it("rebuilds the central accept link from the stored token", async () => {
    findFirstInvitation.mockResolvedValue({ ...baseInvite, centralInviteToken: "tok-abc-123" });

    const POST = await loadPost();
    const res = await POST(makeReq(), makeCtx("inv-1"));

    expect(res.status).toBe(200);
    expect(dispatchInvitationEmail).toHaveBeenCalledTimes(1);
    const arg = dispatchInvitationEmail.mock.calls[0][0] as { setupUrl?: string | null; to?: string };
    expect(arg.setupUrl).toBe("http://localhost:3000/invitations/accept?token=tok-abc-123");
    expect(arg.to).toBe("new.user@acme.com");
  });

  it("falls back to the login link (setupUrl null) when there is no central token", async () => {
    findFirstInvitation.mockResolvedValue({ ...baseInvite, centralInviteToken: null });

    const POST = await loadPost();
    const res = await POST(makeReq(), makeCtx("inv-1"));

    expect(res.status).toBe(200);
    const arg = dispatchInvitationEmail.mock.calls[0][0] as { setupUrl?: string | null };
    expect(arg.setupUrl).toBeNull();
  });

  it("rejects an already-accepted invite without sending email", async () => {
    findFirstInvitation.mockResolvedValue({ ...baseInvite, status: "Accepted", centralInviteToken: "tok-abc-123" });

    const POST = await loadPost();
    const res = await POST(makeReq(), makeCtx("inv-1"));

    expect(res.status).toBe(409);
    expect(dispatchInvitationEmail).not.toHaveBeenCalled();
  });
});
