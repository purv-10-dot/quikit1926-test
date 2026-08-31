/**
 * ICP selection in the LinkedIn Prospect workflow.
 *
 * Covers the three required cases per route (401 / org-isolation / happy path)
 * plus the parts most likely to regress:
 *   - a cuid from another tenant must not be attachable (the ICP id is
 *     client-supplied, so it is untrusted input);
 *   - a re-save from an older extension build must not clear a chosen ICP;
 *   - conversion must still work when no ICP was selected (backward compat).
 *
 * verifyExtensionToken is mocked here rather than in setup.ts — the extension
 * routes are the only consumers, and setup.ts reserves global mocks for
 * app-wide concerns.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const extUserRef: { current: { userId: string; email?: string; name?: string } | null } = {
  current: null,
};

vi.mock("@/lib/auth/extension-token", () => ({
  verifyExtensionToken: vi.fn(async () => extUserRef.current),
}));

// The prospect-save route logs an activity as a side effect; keep it inert so a
// logging path can't fail the assertions under test.
vi.mock("@/lib/services/activities/log-activity", () => ({
  logActivity: vi.fn(async () => undefined),
}));

const db = mockDb();

function extAuthed(userId = "u1") {
  extUserRef.current = { userId, email: "rep@example.com", name: "Rep One" };
}

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer fake" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  extUserRef.current = null;
  setSession(null);
  process.env.NEXTAUTH_SECRET = "test-secret-not-real";
});

// ─── GET /api/extension-auth/icp ─────────────────────────────────────────────
describe("GET /api/extension-auth/icp", () => {
  it("401s without a valid extension token", async () => {
    const { GET } = await import("@/app/api/extension-auth/icp/route");
    const res = await GET(jsonReq("http://test/api/extension-auth/icp", "GET"));
    expect(res.status).toBe(401);
  });

  it("403s when the caller is not a member of the requested org", async () => {
    extAuthed();
    db.orgMember.findFirst.mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/extension-auth/icp/route");
    const res = await GET(jsonReq("http://test/api/extension-auth/icp?orgId=t2", "GET"));
    expect(res.status).toBe(403);
    expect(db.crmIcpProfile.findMany).not.toHaveBeenCalled();
  });

  it("returns ONLY active, non-deleted ICPs for the resolved org", async () => {
    extAuthed();
    db.orgMember.findFirst.mockResolvedValue({ orgId: "t1" } as never);
    db.crmIcpProfile.findMany.mockResolvedValue([
      { id: "icp1", name: "Mid-market manufacturers", segment: "MidMarket" },
    ] as never);

    const { GET } = await import("@/app/api/extension-auth/icp/route");
    const res = await GET(jsonReq("http://test/api/extension-auth/icp?orgId=t1", "GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.icps[0].name).toBe("Mid-market manufacturers");

    const where = db.crmIcpProfile.findMany.mock.calls[0]?.[0]?.where as {
      orgId?: string;
      isActive?: boolean;
      deletedAt?: unknown;
    };
    expect(where.orgId).toBe("t1");
    expect(where.isActive).toBe(true);
    expect(where.deletedAt).toBeNull();
  });

  it("falls back to the first active membership when no orgId is given", async () => {
    extAuthed();
    db.orgMember.findFirst.mockResolvedValue({ orgId: "t-first" } as never);
    db.crmIcpProfile.findMany.mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/extension-auth/icp/route");
    const res = await GET(jsonReq("http://test/api/extension-auth/icp", "GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.orgId).toBe("t-first");
  });

  it("403s when the user has no active organization at all", async () => {
    extAuthed();
    db.orgMember.findFirst.mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/extension-auth/icp/route");
    const res = await GET(jsonReq("http://test/api/extension-auth/icp", "GET"));
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/leads/from-linkedin (icpId) ───────────────────────────────────
describe("POST /api/leads/from-linkedin — icpId", () => {
  function orgResolves(orgId = "t1") {
    db.orgMember.findFirst.mockResolvedValue({ orgId } as never);
  }

  it("401s without a valid extension token", async () => {
    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    const res = await POST(
      jsonReq("http://test/api/leads/from-linkedin", "POST", { name: "A" }),
    );
    expect(res.status).toBe(401);
  });

  it("saves without an icpId (backward compatible)", async () => {
    extAuthed();
    orgResolves();
    db.crmProspect.create.mockResolvedValue({ id: "p1" } as never);

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    const res = await POST(
      jsonReq("http://test/api/leads/from-linkedin", "POST", { name: "No ICP Person" }),
    );

    expect(res.status).toBe(201);
    // No ICP lookup should even be attempted.
    expect(db.crmIcpProfile.findFirst).not.toHaveBeenCalled();
    const data = db.crmProspect.create.mock.calls[0]?.[0]?.data as { icpId?: string };
    expect(data.icpId).toBeUndefined();
  });

  it("400s when the icpId belongs to another org (isolation)", async () => {
    extAuthed();
    orgResolves("t1");
    // Org-scoped lookup finds nothing for a foreign ICP.
    db.crmIcpProfile.findFirst.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    const res = await POST(
      jsonReq("http://test/api/leads/from-linkedin", "POST", {
        name: "Cross Tenant",
        icpId: "icp-from-t2",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/ICP not found/i);
    expect(db.crmProspect.create).not.toHaveBeenCalled();
    expect(db.crmProspect.upsert).not.toHaveBeenCalled();

    const where = db.crmIcpProfile.findFirst.mock.calls[0]?.[0]?.where as {
      orgId?: string;
      isActive?: boolean;
    };
    expect(where.orgId).toBe("t1");
    expect(where.isActive).toBe(true);
  });

  it("persists a valid icpId on create", async () => {
    extAuthed();
    orgResolves("t1");
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmProspect.create.mockResolvedValue({ id: "p1" } as never);

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    const res = await POST(
      jsonReq("http://test/api/leads/from-linkedin", "POST", {
        name: "With ICP",
        icpId: "icp1",
      }),
    );

    expect(res.status).toBe(201);
    const data = db.crmProspect.create.mock.calls[0]?.[0]?.data as { icpId?: string };
    expect(data.icpId).toBe("icp1");
  });

  it("sets icpId on BOTH branches of the upsert when a URL is present", async () => {
    extAuthed();
    orgResolves("t1");
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmProspect.upsert.mockResolvedValue({ id: "p1" } as never);

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    await POST(
      jsonReq("http://test/api/leads/from-linkedin", "POST", {
        name: "Upsert Person",
        linkedinUrl: "https://linkedin.com/in/x",
        icpId: "icp1",
      }),
    );

    const arg = db.crmProspect.upsert.mock.calls[0]?.[0] as {
      create?: { icpId?: string };
      update?: { icpId?: string };
    };
    expect(arg.create?.icpId).toBe("icp1");
    expect(arg.update?.icpId).toBe("icp1");
  });

  it("does NOT clear an existing icpId when a re-save omits it", async () => {
    extAuthed();
    orgResolves("t1");
    db.crmProspect.upsert.mockResolvedValue({ id: "p1" } as never);

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    await POST(
      jsonReq("http://test/api/leads/from-linkedin", "POST", {
        name: "Legacy Extension Save",
        linkedinUrl: "https://linkedin.com/in/x",
        // no icpId — an older extension build
      }),
    );

    const arg = db.crmProspect.upsert.mock.calls[0]?.[0] as {
      update?: Record<string, unknown>;
    };
    // The key must be absent, not null — Prisma would write null and wipe it.
    expect(arg.update && "icpId" in arg.update).toBe(false);
  });

  it("ignores an empty-string icpId rather than validating it", async () => {
    extAuthed();
    orgResolves("t1");
    db.crmProspect.create.mockResolvedValue({ id: "p1" } as never);

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    const res = await POST(
      jsonReq("http://test/api/leads/from-linkedin", "POST", { name: "Blank ICP", icpId: "  " }),
    );

    expect(res.status).toBe(201);
    expect(db.crmIcpProfile.findFirst).not.toHaveBeenCalled();
  });
});

// ─── assertIcpInOrg (shared guard used by the lead routes) ───────────────────
describe("assertIcpInOrg", () => {
  it("throws a 400 with fieldErrors.icpId when not found in the org", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue(null as never);
    const { assertIcpInOrg } = await import("@/lib/services/icp/assert-icp");
    await expect(assertIcpInOrg("t1", "icp-from-t2")).rejects.toMatchObject({
      statusCode: 400,
      fieldErrors: { icpId: "Selected ICP not found" },
    });
  });

  it("requires an active profile by default", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    const { assertIcpInOrg } = await import("@/lib/services/icp/assert-icp");
    await assertIcpInOrg("t1", "icp1");

    const where = db.crmIcpProfile.findFirst.mock.calls[0]?.[0]?.where as {
      isActive?: boolean;
      deletedAt?: unknown;
      orgId?: string;
    };
    expect(where.orgId).toBe("t1");
    expect(where.isActive).toBe(true);
    expect(where.deletedAt).toBeNull();
  });

  it("allows an inactive profile when requireActive is false", async () => {
    // Conversion path: a prospect may reference an ICP deactivated since saving,
    // and dropping the reference would lose data the user recorded on purpose.
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    const { assertIcpInOrg } = await import("@/lib/services/icp/assert-icp");
    await assertIcpInOrg("t1", "icp1", { requireActive: false });

    const where = db.crmIcpProfile.findFirst.mock.calls[0]?.[0]?.where as {
      isActive?: boolean;
    };
    expect(where.isActive).toBeUndefined();
  });
});
