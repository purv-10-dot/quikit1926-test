/**
 * PATCH /api/settings/prospects/[id] — the prospect edit endpoint.
 *
 * Beyond 401 / org-isolation / happy path, these pin the rules the edit flow
 * depends on:
 *
 *   1. The origin Upwork reference is immutable — editing can never re-point it.
 *   2. ICP is a verified reference: a foreign or unknown id is rejected, and an
 *      explicit null clears the link.
 *   3. Non-admins can only edit prospects they saved (ACL via prospectScopeWhere).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function session(orgId = "t1", role = "Administrator") {
  setSession({ userId: "u1", orgId, role, email: "a@b.co", name: "Alice" });
}

function patchReq(body?: unknown) {
  return new Request("http://test/api/settings/prospects/p1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as import("next/server").NextRequest;
}

const params = Promise.resolve({ id: "p1" });

beforeEach(() => {
  setSession(null);
  vi.clearAllMocks();
});

describe("PATCH /api/settings/prospects/[id]", () => {
  it("401s when unauthenticated", async () => {
    const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
    const res = await PATCH(patchReq({ name: "Jane" }), { params });
    expect(res.status).toBe(401);
  });

  it("400s when the body has no updatable fields", async () => {
    session();
    const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
    const res = await PATCH(patchReq({}), { params });
    expect(res.status).toBe(400);
    expect(db.crmProspect.update).not.toHaveBeenCalled();
  });

  it("400s on an invalid email", async () => {
    session();
    const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
    const res = await PATCH(patchReq({ email: "not-an-email" }), { params });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.fieldErrors.email).toBeTruthy();
    expect(db.crmProspect.update).not.toHaveBeenCalled();
  });

  it("updates only the fields sent, scoped to the caller's org", async () => {
    session("t1");
    db.crmProspect.findFirst.mockResolvedValue({ id: "p1" } as never);
    db.crmProspect.update.mockResolvedValue({ id: "p1", name: "Jane R" } as never);

    const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
    const res = await PATCH(patchReq({ name: "Jane R", title: "Head of Ops" }), {
      params,
    });

    expect(res.status).toBe(200);
    const where = db.crmProspect.findFirst.mock.calls[0]?.[0]?.where as {
      orgId?: string;
    };
    expect(where.orgId).toBe("t1");

    const data = db.crmProspect.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).toEqual({ name: "Jane R", title: "Head of Ops" });
    // Omitted fields must not be nulled out.
    expect(data).not.toHaveProperty("email");
    expect(data).not.toHaveProperty("icp");
  });

  it("404s for a prospect in another org", async () => {
    session("t2");
    db.crmProspect.findFirst.mockResolvedValue(null as never);

    const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
    const res = await PATCH(patchReq({ name: "Jane" }), { params });

    expect(res.status).toBe(404);
    expect(db.crmProspect.update).not.toHaveBeenCalled();
    const where = db.crmProspect.findFirst.mock.calls[0]?.[0]?.where as {
      orgId?: string;
    };
    expect(where.orgId).toBe("t2");
  });

  it("scopes a non-admin to prospects they saved", async () => {
    session("t1", "SalesUser");
    db.crmProspect.findFirst.mockResolvedValue(null as never);

    const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
    const res = await PATCH(patchReq({ name: "Jane" }), { params });

    expect(res.status).toBe(404);
    const where = db.crmProspect.findFirst.mock.calls[0]?.[0]?.where as {
      savedById?: string;
    };
    expect(where.savedById).toBe("u1");
  });

  describe("ICP", () => {
    it("connects a verified in-org ICP", async () => {
      session("t1");
      db.crmProspect.findFirst.mockResolvedValue({ id: "p1" } as never);
      db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
      db.crmProspect.update.mockResolvedValue({ id: "p1", icpId: "icp1" } as never);

      const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
      const res = await PATCH(patchReq({ icpId: "icp1" }), { params });

      expect(res.status).toBe(200);
      const icpWhere = db.crmIcpProfile.findFirst.mock.calls[0]?.[0]?.where as {
        orgId?: string;
      };
      expect(icpWhere.orgId).toBe("t1");
      const data = db.crmProspect.update.mock.calls[0]?.[0]?.data as {
        icp?: unknown;
      };
      expect(data.icp).toEqual({ connect: { id: "icp1" } });
    });

    it("400s for an ICP from another org", async () => {
      session("t1");
      db.crmProspect.findFirst.mockResolvedValue({ id: "p1" } as never);
      db.crmIcpProfile.findFirst.mockResolvedValue(null as never);

      const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
      const res = await PATCH(patchReq({ icpId: "foreign" }), { params });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.fieldErrors.icpId).toBeTruthy();
      expect(db.crmProspect.update).not.toHaveBeenCalled();
    });

    it("disconnects the ICP when null is sent", async () => {
      session("t1");
      db.crmProspect.findFirst.mockResolvedValue({ id: "p1" } as never);
      db.crmProspect.update.mockResolvedValue({ id: "p1", icpId: null } as never);

      const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
      const res = await PATCH(patchReq({ icpId: null }), { params });

      expect(res.status).toBe(200);
      // No verification query needed when clearing.
      expect(db.crmIcpProfile.findFirst).not.toHaveBeenCalled();
      const data = db.crmProspect.update.mock.calls[0]?.[0]?.data as { icp?: unknown };
      expect(data.icp).toEqual({ disconnect: true });
    });
  });

  it("ignores upworkJobId — the origin reference is immutable", async () => {
    session("t1");
    db.crmProspect.findFirst.mockResolvedValue({ id: "p1" } as never);
    db.crmProspect.update.mockResolvedValue({ id: "p1", name: "Jane" } as never);

    const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
    const res = await PATCH(patchReq({ name: "Jane", upworkJobId: "other-job" }), {
      params,
    });

    expect(res.status).toBe(200);
    const data = db.crmProspect.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty("upworkJobId");
    // And the Upwork record itself is never touched.
    expect(db.crmUpworkJob.update).not.toHaveBeenCalled();
    expect(db.crmUpworkJob.updateMany).not.toHaveBeenCalled();
  });

  it("409s when the LinkedIn URL is already used by another prospect", async () => {
    session("t1");
    db.crmProspect.findFirst.mockResolvedValue({ id: "p1" } as never);

    const { Prisma } = await import("@prisma/client");
    db.crmProspect.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "5.22.0",
        meta: { target: ["orgId", "linkedinUrl"] },
      }) as never,
    );

    const { PATCH } = await import("@/app/api/settings/prospects/[id]/route");
    const res = await PATCH(
      patchReq({ linkedinUrl: "https://www.linkedin.com/in/jane" }),
      { params },
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.fieldErrors.linkedinUrl).toBeTruthy();
  });
});
