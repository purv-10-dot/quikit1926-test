/**
 * POST /api/prospects — the shared prospect create endpoint.
 *
 * Beyond the three standard cases (401 / org-isolation / happy path), these pin
 * the rules that carry the Upwork→Prospect conversion's meaning:
 *
 *   1. The Upwork job is a REFERENCE — conversion must never modify or delete it.
 *   2. One prospect per Upwork job (duplicate prevention), including the race.
 *   3. A job from another org cannot be linked.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function session(orgId = "t1", role = "Administrator") {
  setSession({ userId: "u1", orgId, role, email: "a@b.co", name: "Alice" });
}

function jsonReq(body?: unknown) {
  return new Request("http://test/api/prospects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.clearAllMocks();
});

describe("POST /api/prospects", () => {
  it("401s when unauthenticated", async () => {
    const { POST } = await import("@/app/api/prospects/route");
    const res = await POST(jsonReq({ name: "Jane" }));
    expect(res.status).toBe(401);
  });

  it("400s when name is missing", async () => {
    session();
    const { POST } = await import("@/app/api/prospects/route");
    const res = await POST(jsonReq({ title: "Data Entry" }));
    expect(res.status).toBe(400);
  });

  it("creates a prospect scoped to the caller's org and records the saver", async () => {
    session("t1");
    db.crmProspect.create.mockResolvedValue({
      id: "p1",
      name: "Jane",
      upworkJobId: null,
    } as never);

    const { POST } = await import("@/app/api/prospects/route");
    const res = await POST(jsonReq({ name: "Jane", title: "Data Entry Specialist" }));

    expect(res.status).toBe(201);
    const data = db.crmProspect.create.mock.calls[0]?.[0]?.data as {
      orgId?: string;
      savedById?: string;
      name?: string;
    };
    expect(data.orgId).toBe("t1");
    expect(data.savedById).toBe("u1");
    expect(data.name).toBe("Jane");
  });

  describe("Upwork conversion", () => {
    it("links the prospect to the Upwork job WITHOUT modifying the job", async () => {
      session("t1");
      db.crmUpworkJob.findFirst.mockResolvedValue({ id: "job1" } as never);
      db.crmProspect.findFirst.mockResolvedValue(null as never);
      db.crmProspect.create.mockResolvedValue({
        id: "p1",
        name: "Jane",
        upworkJobId: "job1",
      } as never);

      const { POST } = await import("@/app/api/prospects/route");
      const res = await POST(
        jsonReq({ name: "Jane", title: "Data Entry Specialist", upworkJobId: "job1" }),
      );

      expect(res.status).toBe(201);
      const data = db.crmProspect.create.mock.calls[0]?.[0]?.data as {
        upworkJobId?: string;
      };
      expect(data.upworkJobId).toBe("job1");

      // The core guarantee: the original Upwork record is untouched.
      expect(db.crmUpworkJob.update).not.toHaveBeenCalled();
      expect(db.crmUpworkJob.updateMany).not.toHaveBeenCalled();
      expect(db.crmUpworkJob.delete).not.toHaveBeenCalled();
      expect(db.crmUpworkJob.deleteMany).not.toHaveBeenCalled();
    });

    it("logs a conversion activity via the shared activity path", async () => {
      session("t1", "SalesUser");
      db.crmUpworkJob.findFirst.mockResolvedValue({
        id: "job1",
        jobTitle: "Data Entry Specialist Needed",
        jobUrl: "https://www.upwork.com/jobs/x_~01",
      } as never);
      db.crmProspect.findFirst.mockResolvedValue(null as never);
      db.crmProspect.create.mockResolvedValue({
        id: "p1",
        name: "Jane",
        upworkJobId: "job1",
      } as never);
      db.user.findUnique.mockResolvedValue({
        id: "u1",
        firstName: "Alice",
        lastName: "Smith",
        email: "a@b.co",
      } as never);
      db.crmActivity.upsert.mockResolvedValue({ id: "act1" } as never);

      const { POST } = await import("@/app/api/prospects/route");
      await POST(jsonReq({ name: "Jane", upworkJobId: "job1" }));
      // Fire-and-forget — let the microtask queue drain.
      await new Promise((r) => setTimeout(r, 0));

      expect(db.crmActivity.upsert).toHaveBeenCalledTimes(1);
      const call = db.crmActivity.upsert.mock.calls[0]?.[0] as {
        where: { orgId_sourceSystem_externalId: Record<string, string> };
        create: Record<string, unknown>;
      };
      expect(call.where.orgId_sourceSystem_externalId.externalId).toBe(
        "job1:UPWORK_CONVERTED_TO_PROSPECT",
      );
      expect(call.create).toMatchObject({
        orgId: "t1",
        type: "UPWORK_CONVERTED_TO_PROSPECT",
        ownerId: "u1",
        sourceSystem: "upwork-extension",
      });
    });

    it("does NOT log a conversion activity for a plain (non-Upwork) prospect", async () => {
      session("t1");
      db.crmProspect.create.mockResolvedValue({
        id: "p1",
        name: "Jane",
        upworkJobId: null,
      } as never);

      const { POST } = await import("@/app/api/prospects/route");
      await POST(jsonReq({ name: "Jane" }));
      await new Promise((r) => setTimeout(r, 0));

      expect(db.crmActivity.upsert).not.toHaveBeenCalled();
      expect(db.crmActivity.create).not.toHaveBeenCalled();
    });

    it("still returns 201 when activity logging fails", async () => {
      session("t1");
      db.crmUpworkJob.findFirst.mockResolvedValue({
        id: "job1",
        jobTitle: "Job",
        jobUrl: null,
      } as never);
      db.crmProspect.findFirst.mockResolvedValue(null as never);
      db.crmProspect.create.mockResolvedValue({
        id: "p1",
        name: "Jane",
        upworkJobId: "job1",
      } as never);
      db.user.findUnique.mockRejectedValue(new Error("db down") as never);

      const { POST } = await import("@/app/api/prospects/route");
      const res = await POST(jsonReq({ name: "Jane", upworkJobId: "job1" }));
      await new Promise((r) => setTimeout(r, 0));

      expect(res.status).toBe(201);
    });

    it("409s when the job has already been converted, returning the existing prospect", async () => {
      session("t1");
      db.crmUpworkJob.findFirst.mockResolvedValue({ id: "job1" } as never);
      db.crmProspect.findFirst.mockResolvedValue({ id: "p-existing", name: "Bob" } as never);

      const { POST } = await import("@/app/api/prospects/route");
      const res = await POST(jsonReq({ name: "Jane", upworkJobId: "job1" }));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.data.prospectId).toBe("p-existing");
      expect(db.crmProspect.create).not.toHaveBeenCalled();
    });

    it("404s for an Upwork job belonging to another org", async () => {
      session("t2");
      // Org-scoped lookup finds nothing for this tenant.
      db.crmUpworkJob.findFirst.mockResolvedValue(null as never);

      const { POST } = await import("@/app/api/prospects/route");
      const res = await POST(jsonReq({ name: "Jane", upworkJobId: "job1" }));

      expect(res.status).toBe(404);
      expect(db.crmProspect.create).not.toHaveBeenCalled();

      const where = db.crmUpworkJob.findFirst.mock.calls[0]?.[0]?.where as {
        orgId?: string;
      };
      expect(where.orgId).toBe("t2");
    });

    it("resolves the race to the winning prospect when the unique constraint fires", async () => {
      session("t1");
      db.crmUpworkJob.findFirst.mockResolvedValue({ id: "job1" } as never);
      // Pre-check passes, then the insert loses the race.
      db.crmProspect.findFirst
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce({ id: "p-winner", name: "Bob" } as never);

      const { Prisma } = await import("@prisma/client");
      db.crmProspect.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "5.22.0",
          meta: { target: ["orgId", "upworkJobId"] },
        }) as never,
      );

      const { POST } = await import("@/app/api/prospects/route");
      const res = await POST(jsonReq({ name: "Jane", upworkJobId: "job1" }));
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.data.prospectId).toBe("p-winner");
    });
  });
});
