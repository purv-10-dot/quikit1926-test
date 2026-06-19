import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Coverage for POST /api/v1/hrms/invitations/bulk after aligning it with the
 * single-invite flow: every valid row is provisioned centrally
 * (provisionMemberRemote), the central token is persisted on the Invitation,
 * and the email carries the accept link / temp password. A row that fails
 * provisioning is skipped — it must not fail the rest of the batch.
 */

process.env.QUIKIT_URL = "http://localhost:3000";
delete process.env.NEXT_PUBLIC_QUIKIT_URL;
process.env.NEXT_PUBLIC_BASE_PATH = "";

// ── Mocks ────────────────────────────────────────────────────────────────
const queueInvitationEmail = vi.fn();
const provisionMemberRemote = vi.fn();
const createAuditLog = vi.fn();
const appRoleFindMany = vi.fn();
const employeeFindMany = vi.fn();
const invitationFindMany = vi.fn();
const invitationCreate = vi.fn();
const employeeFindFirst = vi.fn();

vi.mock("@/lib/services/invitation", () => ({
  queueInvitationEmail: (...a: unknown[]) => queueInvitationEmail(...a),
  companyName: async () => "Acme",
}));
vi.mock("@/lib/utils/audit", () => ({ createAuditLog: (...a: unknown[]) => createAuditLog(...a) }));
vi.mock("@/lib/auth/invite-token", () => ({
  generateInviteToken: () => ({ hash: "fresh-hash", token: "raw-token" }),
  inviteExpiry: () => new Date("2026-06-11T00:00:00.000Z"),
}));
vi.mock("@quikit/auth/provision-member-remote", () => ({
  provisionMemberRemote: (...a: unknown[]) => provisionMemberRemote(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appRole: { findMany: (...a: unknown[]) => appRoleFindMany(...a) },
    employee: {
      findMany: (...a: unknown[]) => employeeFindMany(...a),
      findFirst: (...a: unknown[]) => employeeFindFirst(...a),
    },
    invitation: {
      findMany: (...a: unknown[]) => invitationFindMany(...a),
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

type RouteResponse = { status: number; json: () => Promise<{ success: boolean; data: BulkResult }> };
interface BulkResult {
  total: number;
  created: number;
  queued: number;
  emailFailed: number;
  skipped: { email: string; reason: string }[];
}
type PostFn = (req: unknown, ctx: { params: Promise<Record<string, string>> }) => Promise<RouteResponse>;

async function loadPost(): Promise<PostFn> {
  const mod = await import("@/app/api/v1/hrms/invitations/bulk/route");
  return mod.POST as unknown as PostFn;
}

function makeReq(body: unknown) {
  return { nextUrl: { origin: "http://localhost:3009" }, method: "POST", json: async () => body };
}
const ctx = { params: Promise.resolve({}) };

function bulkBody(rows: { email: string; firstName: string; lastName: string; roles?: string }[]) {
  return { fileName: "people.csv", rows, defaultRoleIds: ["role-emp"] };
}

describe("POST /invitations/bulk — single-invite flow per row", () => {
  beforeEach(() => {
    appRoleFindMany.mockResolvedValue([{ id: "role-emp", name: "Employee" }]);
    employeeFindMany.mockResolvedValue([]); // no existing employees
    invitationFindMany.mockResolvedValue([]); // no pending invites
    employeeFindFirst.mockResolvedValue({ firstName: "Admin", lastName: "Boss" });
    invitationCreate.mockResolvedValue({ id: "inv-x" });
    queueInvitationEmail.mockResolvedValue(true);
  });

  it("provisions each row, stores the central token, and emails the accept link", async () => {
    provisionMemberRemote.mockResolvedValue({ ok: true, invitationToken: "tok-1", tempPassword: "Temp#123", isNewUser: true });

    const POST = await loadPost();
    const res = await POST(
      makeReq(bulkBody([{ email: "New.User@acme.com", firstName: "New", lastName: "User" }])),
      ctx,
    );
    const { data } = await res.json();

    expect(res.status).toBe(202);
    expect(data.created).toBe(1);
    expect(data.queued).toBe(1);

    // Central provisioning happened with native default.
    expect(provisionMemberRemote).toHaveBeenCalledTimes(1);
    expect(provisionMemberRemote.mock.calls[0][0]).toMatchObject({
      orgId: "tenant-1",
      email: "new.user@acme.com",
      appSlug: "quikhrms",
      invitationMethod: "native",
    });

    // Central token persisted on the invitation row.
    expect(invitationCreate.mock.calls[0][0].data).toMatchObject({ centralInviteToken: "tok-1" });

    // Email carries the accept link + temp password.
    const mailArg = queueInvitationEmail.mock.calls[0][0];
    expect(mailArg.setupUrl).toBe("http://localhost:3000/invitations/accept?token=tok-1");
    expect(mailArg.tempPassword).toBe("Temp#123");
  });

  it("skips a row whose provisioning fails without failing the batch", async () => {
    provisionMemberRemote
      .mockResolvedValueOnce({ ok: true, invitationToken: "tok-ok", tempPassword: "Temp#1", isNewUser: true })
      .mockResolvedValueOnce({ ok: false, error: "SSO invitations require a Google or Microsoft email address." });

    const POST = await loadPost();
    const res = await POST(
      makeReq(
        bulkBody([
          { email: "good@acme.com", firstName: "Good", lastName: "One" },
          { email: "bad@acme.com", firstName: "Bad", lastName: "Two" },
        ]),
      ),
      ctx,
    );
    const { data } = await res.json();

    expect(data.created).toBe(1);
    expect(invitationCreate).toHaveBeenCalledTimes(1); // only the good row persisted
    expect(data.skipped).toContainEqual({
      email: "bad@acme.com",
      reason: "SSO invitations require a Google or Microsoft email address.",
    });
  });

  it("rejects an over-cap batch (>50 rows) before touching central provisioning", async () => {
    provisionMemberRemote.mockResolvedValue({ ok: true, invitationToken: "tok", tempPassword: "T#1", isNewUser: true });

    const rows = Array.from({ length: 51 }, (_, i) => ({
      email: `user${i}@acme.com`,
      firstName: `First${i}`,
      lastName: `Last${i}`,
    }));

    const POST = await loadPost();
    const res = await POST(makeReq(bulkBody(rows)), ctx);

    // Schema cap (MAX_BULK_UPLOAD_ROWS) trips → 400 validation error, and the
    // request short-circuits before any provisioning / DB write.
    expect(res.status).toBe(400);
    expect(provisionMemberRemote).not.toHaveBeenCalled();
    expect(invitationCreate).not.toHaveBeenCalled();
  });

  it("does not provision rows that are deduped out (existing employee / pending invite)", async () => {
    employeeFindMany.mockResolvedValue([{ workEmail: "taken@acme.com" }]);
    invitationFindMany.mockResolvedValue([{ email: "pending@acme.com" }]);
    provisionMemberRemote.mockResolvedValue({ ok: true, invitationToken: "tok", tempPassword: "T#1", isNewUser: true });

    const POST = await loadPost();
    const res = await POST(
      makeReq(
        bulkBody([
          { email: "taken@acme.com", firstName: "A", lastName: "A" },
          { email: "pending@acme.com", firstName: "B", lastName: "B" },
          { email: "fresh@acme.com", firstName: "C", lastName: "C" },
        ]),
      ),
      ctx,
    );
    const { data } = await res.json();

    expect(provisionMemberRemote).toHaveBeenCalledTimes(1); // only fresh@ provisioned
    expect(data.created).toBe(1);
    expect(data.skipped.map((s) => s.reason).sort()).toEqual(["Employee already exists", "Pending invite exists"]);
  });
});
