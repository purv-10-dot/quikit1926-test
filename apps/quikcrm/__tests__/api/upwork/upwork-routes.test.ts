/**
 * Upwork route tests — the three cases this app requires of every new API route
 * (unauthenticated → 401, org-isolation, happy path), plus the two rules that
 * carry this module's actual business meaning:
 *
 *   1. DEDUPE — the same job is never stored twice per org.
 *   2. SEPARATION — capture never writes a lead / prospect / account / contact /
 *      opportunity. This is the explicit product requirement, so it is asserted
 *      rather than assumed.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function session(orgId = "t1", role = "Administrator") {
  setSession({ userId: "u1", orgId, role, email: "a@b.co", name: "Alice" });
}

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as import("next/server").NextRequest;
}

const JOB_URL = "https://www.upwork.com/jobs/Data-Entry-Specialist_~0123456789abcdef";

function jobRow(over: Record<string, unknown> = {}) {
  return {
    id: "job1",
    orgId: "t1",
    jobUrl: JOB_URL,
    upworkJobId: "~0123456789abcdef",
    dedupeKey: `url:${JOB_URL}`,
    jobTitle: "Data Entry Specialist Needed",
    jobDescription: "Some description",
    projectType: "Ongoing project",
    skills: "Data Entry, Excel",
    clientLocation: "United States",
    proposals: "20 to 50",
    reviews: "4.9",
    projectPrice: "$25.00 Hourly",
    projectTime: "Less than 30 hrs/week",
    requiredConnects: "8",
    rawData: null,
    aiAnalysis: null,
    aiScore: null,
    aiConfidence: null,
    clientMessage: null,
    aiAnalyzedAt: null,
    createdByUserId: "u1",
    updatedByUserId: null,
    deletedAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  setSession(null);
  vi.clearAllMocks();
});

describe("GET /api/upwork", () => {
  it("401s when unauthenticated", async () => {
    const { GET } = await import("@/app/api/upwork/route");
    const res = await GET(jsonReq("http://test/api/upwork", "GET"));
    expect(res.status).toBe(401);
  });

  it("scopes the query to the caller's orgId and excludes soft-deleted rows", async () => {
    session("t1");
    db.crmUpworkJob.findMany.mockResolvedValue([] as never);
    db.crmUpworkJob.count.mockResolvedValue(0 as never);

    const { GET } = await import("@/app/api/upwork/route");
    const res = await GET(jsonReq("http://test/api/upwork", "GET"));
    expect(res.status).toBe(200);

    const where = db.crmUpworkJob.findMany.mock.calls[0]?.[0]?.where as {
      orgId?: string;
      deletedAt?: unknown;
    };
    expect(where.orgId).toBe("t1");
    expect(where.deletedAt).toBeNull();
  });

  it("restricts a non-admin to the rows they captured", async () => {
    session("t1", "SalesUser");
    db.crmUpworkJob.findMany.mockResolvedValue([] as never);
    db.crmUpworkJob.count.mockResolvedValue(0 as never);

    const { GET } = await import("@/app/api/upwork/route");
    await GET(jsonReq("http://test/api/upwork", "GET"));

    const where = db.crmUpworkJob.findMany.mock.calls[0]?.[0]?.where as {
      createdByUserId?: string;
    };
    expect(where.createdByUserId).toBe("u1");
  });

  it("does NOT restrict by owner for an Administrator", async () => {
    session("t1", "Administrator");
    db.crmUpworkJob.findMany.mockResolvedValue([] as never);
    db.crmUpworkJob.count.mockResolvedValue(0 as never);

    const { GET } = await import("@/app/api/upwork/route");
    await GET(jsonReq("http://test/api/upwork", "GET"));

    const where = db.crmUpworkJob.findMany.mock.calls[0]?.[0]?.where as {
      createdByUserId?: string;
    };
    expect(where.createdByUserId).toBeUndefined();
  });

  it("searches across title, description, skills and location", async () => {
    session("t1");
    db.crmUpworkJob.findMany.mockResolvedValue([] as never);
    db.crmUpworkJob.count.mockResolvedValue(0 as never);

    const { GET } = await import("@/app/api/upwork/route");
    await GET(jsonReq("http://test/api/upwork?q=excel", "GET"));

    const where = db.crmUpworkJob.findMany.mock.calls[0]?.[0]?.where as {
      OR?: Array<Record<string, unknown>>;
    };
    expect(where.OR).toHaveLength(4);
  });

  it("returns the paginated envelope on the happy path", async () => {
    session("t1");
    db.crmUpworkJob.findMany.mockResolvedValue([jobRow()] as never);
    db.crmUpworkJob.count.mockResolvedValue(1 as never);

    const { GET } = await import("@/app/api/upwork/route");
    const res = await GET(jsonReq("http://test/api/upwork", "GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data).toMatchObject({ total: 1, page: 1, totalPages: 1 });
  });
});

describe("POST /api/upwork", () => {
  it("401s when unauthenticated", async () => {
    const { POST } = await import("@/app/api/upwork/route");
    const res = await POST(
      jsonReq("http://test/api/upwork", "POST", { jobTitle: "X" }),
    );
    expect(res.status).toBe(401);
  });

  it("400s when jobTitle is missing", async () => {
    session("t1");
    const { POST } = await import("@/app/api/upwork/route");
    const res = await POST(jsonReq("http://test/api/upwork", "POST", { skills: "Excel" }));
    expect(res.status).toBe(400);
  });

  it("creates the job scoped to the caller's org and records the owner", async () => {
    session("t1");
    db.crmUpworkJob.findFirst.mockResolvedValue(null as never);
    db.crmUpworkJob.create.mockResolvedValue(jobRow() as never);

    const { POST } = await import("@/app/api/upwork/route");
    const res = await POST(
      jsonReq("http://test/api/upwork", "POST", {
        jobTitle: "Data Entry Specialist Needed",
        jobUrl: JOB_URL,
        skills: "Data Entry, Excel",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.duplicate).toBe(false);

    const data = db.crmUpworkJob.create.mock.calls[0]?.[0]?.data as {
      orgId?: string;
      createdByUserId?: string;
      dedupeKey?: string;
      upworkJobId?: string;
    };
    expect(data.orgId).toBe("t1");
    expect(data.createdByUserId).toBe("u1");
    expect(data.dedupeKey).toBe(`url:${JOB_URL}`);
    expect(data.upworkJobId).toBe("~0123456789abcdef");
  });

  it("returns the existing row with duplicate:true instead of creating a second", async () => {
    session("t1");
    db.crmUpworkJob.findFirst.mockResolvedValue(jobRow() as never);

    const { POST } = await import("@/app/api/upwork/route");
    const res = await POST(
      jsonReq("http://test/api/upwork", "POST", {
        jobTitle: "Data Entry Specialist Needed",
        jobUrl: JOB_URL,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.duplicate).toBe(true);
    expect(body.data.job.id).toBe("job1");
    expect(db.crmUpworkJob.create).not.toHaveBeenCalled();
  });

  it("dedupes the same job captured with different tracking query strings", async () => {
    session("t1");
    db.crmUpworkJob.findFirst.mockResolvedValue(null as never);
    db.crmUpworkJob.create.mockResolvedValue(jobRow() as never);

    const { POST } = await import("@/app/api/upwork/route");
    await POST(
      jsonReq("http://test/api/upwork", "POST", {
        jobTitle: "Data Entry Specialist Needed",
        jobUrl: `${JOB_URL}/?source=search&referrer_url_path=%2Fnx`,
      }),
    );

    // The query string and trailing slash must not change the dedupe key, or the
    // same job captured from search vs. a direct link would create two rows.
    const data = db.crmUpworkJob.create.mock.calls[0]?.[0]?.data as { dedupeKey?: string };
    expect(data.dedupeKey).toBe(`url:${JOB_URL}`);
  });

  it("falls back to a content hash when no job URL was scraped", async () => {
    session("t1");
    db.crmUpworkJob.findFirst.mockResolvedValue(null as never);
    db.crmUpworkJob.create.mockResolvedValue(jobRow() as never);

    const { POST } = await import("@/app/api/upwork/route");
    await POST(
      jsonReq("http://test/api/upwork", "POST", {
        jobTitle: "Data Entry Specialist Needed",
        jobDescription: "Some description",
      }),
    );

    const data = db.crmUpworkJob.create.mock.calls[0]?.[0]?.data as {
      dedupeKey?: string;
      jobUrl?: string | null;
    };
    expect(data.jobUrl).toBeNull();
    expect(data.dedupeKey).toMatch(/^hash:[0-9a-f]{64}$/u);
  });

  it("rejects a non-Upwork URL", async () => {
    session("t1");
    const { POST } = await import("@/app/api/upwork/route");
    const res = await POST(
      jsonReq("http://test/api/upwork", "POST", {
        jobTitle: "Phishy",
        jobUrl: "https://evil.example.com/jobs/1",
      }),
    );
    expect(res.status).toBe(400);
  });

  /**
   * Activity creation. The capture must produce exactly one CrmActivity, owned
   * by the capturing user, through the SHARED logActivity() path — not a bespoke
   * Upwork activity store.
   *
   * logActivity() takes its upsert branch whenever externalId + sourceSystem are
   * both set, so these assert on crmActivity.upsert rather than .create.
   */
  it("creates an activity for the captured job, owned by the capturing user", async () => {
    session("t1", "SalesUser");
    db.crmUpworkJob.findFirst.mockResolvedValue(null as never);
    db.crmUpworkJob.create.mockResolvedValue(jobRow() as never);
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      firstName: "Alice",
      lastName: "Smith",
      email: "a@b.co",
    } as never);
    db.crmActivity.upsert.mockResolvedValue({ id: "act1" } as never);

    const { POST } = await import("@/app/api/upwork/route");
    await POST(
      jsonReq("http://test/api/upwork", "POST", {
        jobTitle: "Data Entry Specialist Needed",
        jobUrl: JOB_URL,
      }),
    );

    // The activity write is fire-and-forget, so let the microtask queue drain.
    await new Promise((r) => setTimeout(r, 0));

    expect(db.crmActivity.upsert).toHaveBeenCalledTimes(1);
    const call = db.crmActivity.upsert.mock.calls[0]?.[0] as {
      where: { orgId_sourceSystem_externalId: Record<string, string> };
      create: Record<string, unknown>;
    };

    // The idempotency key — this is what stops a re-add duplicating the row,
    // and what the detail-page timeline queries by (jobId-first prefix).
    expect(call.where.orgId_sourceSystem_externalId).toEqual({
      orgId: "t1",
      sourceSystem: "upwork-extension",
      externalId: "job1:UPWORK_JOB_SAVED",
    });

    expect(call.create).toMatchObject({
      orgId: "t1",
      type: "UPWORK_JOB_SAVED",
      // Standalone: an Upwork job is not a Lead/Opp/Contact/Account.
      relatedKind: "None",
      relatedObjectId: "standalone",
      ownerId: "u1",
      ownerName: "Alice Smith",
      sourceSystem: "upwork-extension",
      subject: "Saved Upwork job: Data Entry Specialist Needed",
    });
  });

  it("does NOT create a second activity when the same job is re-added", async () => {
    session("t1");
    // Job already captured → createUpworkJob returns duplicate:true.
    db.crmUpworkJob.findFirst.mockResolvedValue(jobRow() as never);

    const { POST } = await import("@/app/api/upwork/route");
    const res = await POST(
      jsonReq("http://test/api/upwork", "POST", {
        jobTitle: "Data Entry Specialist Needed",
        jobUrl: JOB_URL,
      }),
    );
    await new Promise((r) => setTimeout(r, 0));

    const body = await res.json();
    expect(body.data.duplicate).toBe(true);
    expect(db.crmActivity.upsert).not.toHaveBeenCalled();
    expect(db.crmActivity.create).not.toHaveBeenCalled();
  });

  it("still returns 201 when activity logging fails — the capture must not fail", async () => {
    session("t1");
    db.crmUpworkJob.findFirst.mockResolvedValue(null as never);
    db.crmUpworkJob.create.mockResolvedValue(jobRow() as never);
    db.user.findUnique.mockRejectedValue(new Error("db down") as never);

    const { POST } = await import("@/app/api/upwork/route");
    const res = await POST(
      jsonReq("http://test/api/upwork", "POST", {
        jobTitle: "Data Entry Specialist Needed",
        jobUrl: JOB_URL,
      }),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(res.status).toBe(201);
  });

  /**
   * The core product rule: an Upwork capture is a standalone entity. If someone
   * later "helpfully" wires conversion into the capture path, this fails.
   */
  it("never writes a lead, prospect, account, contact or opportunity", async () => {
    session("t1");
    db.crmUpworkJob.findFirst.mockResolvedValue(null as never);
    db.crmUpworkJob.create.mockResolvedValue(jobRow() as never);

    const { POST } = await import("@/app/api/upwork/route");
    await POST(
      jsonReq("http://test/api/upwork", "POST", {
        jobTitle: "Data Entry Specialist Needed",
        jobUrl: JOB_URL,
      }),
    );

    expect(db.crmLead.create).not.toHaveBeenCalled();
    expect(db.crmProspect.create).not.toHaveBeenCalled();
    expect(db.crmAccount.create).not.toHaveBeenCalled();
    expect(db.crmContact.create).not.toHaveBeenCalled();
    expect(db.crmOpportunity.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/upwork/[id]", () => {
  it("401s when unauthenticated", async () => {
    const { GET } = await import("@/app/api/upwork/[id]/route");
    const res = await GET(jsonReq("http://test/api/upwork/job1", "GET"), {
      params: Promise.resolve({ id: "job1" }),
    });
    expect(res.status).toBe(401);
  });

  it("404s for another org's job (no cross-tenant read)", async () => {
    session("t2");
    db.crmUpworkJob.findFirst.mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/upwork/[id]/route");
    const res = await GET(jsonReq("http://test/api/upwork/job1", "GET"), {
      params: Promise.resolve({ id: "job1" }),
    });

    expect(res.status).toBe(404);
    const where = db.crmUpworkJob.findFirst.mock.calls[0]?.[0]?.where as { orgId?: string };
    expect(where.orgId).toBe("t2");
  });

  it("returns the job on the happy path", async () => {
    session("t1");
    db.crmUpworkJob.findFirst.mockResolvedValue(jobRow() as never);

    const { GET } = await import("@/app/api/upwork/[id]/route");
    const res = await GET(jsonReq("http://test/api/upwork/job1", "GET"), {
      params: Promise.resolve({ id: "job1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.jobTitle).toBe("Data Entry Specialist Needed");
  });
});

describe("DELETE /api/upwork/[id]", () => {
  it("soft-deletes rather than removing the row", async () => {
    session("t1");
    db.crmUpworkJob.findFirst.mockResolvedValue(jobRow() as never);
    db.crmUpworkJob.updateMany.mockResolvedValue({ count: 1 } as never);

    const { DELETE } = await import("@/app/api/upwork/[id]/route");
    const res = await DELETE(jsonReq("http://test/api/upwork/job1", "DELETE"), {
      params: Promise.resolve({ id: "job1" }),
    });

    expect(res.status).toBe(200);
    expect(db.crmUpworkJob.delete).not.toHaveBeenCalled();
    const data = db.crmUpworkJob.updateMany.mock.calls[0]?.[0]?.data as {
      deletedAt?: Date;
    };
    expect(data.deletedAt).toBeInstanceOf(Date);
  });
});

describe("POST /api/upwork/[id]/ai-analysis", () => {
  it("attaches the AI output to the existing job row", async () => {
    session("t1");
    db.crmUpworkJob.findFirst.mockResolvedValue(jobRow() as never);
    db.crmUpworkJob.updateMany.mockResolvedValue({ count: 1 } as never);

    const { POST } = await import("@/app/api/upwork/[id]/ai-analysis/route");
    const res = await POST(
      jsonReq("http://test/api/upwork/job1/ai-analysis", "POST", {
        analysis: { match_percentages: { skills: 80 } },
        score: 72,
        confidence: "high",
        clientMessage: "Hello there",
      }),
      { params: Promise.resolve({ id: "job1" }) },
    );

    expect(res.status).toBe(200);
    const data = db.crmUpworkJob.updateMany.mock.calls[0]?.[0]?.data as {
      aiScore?: number;
      clientMessage?: string;
      aiAnalyzedAt?: Date;
    };
    expect(data.aiScore).toBe(72);
    expect(data.clientMessage).toBe("Hello there");
    expect(data.aiAnalyzedAt).toBeInstanceOf(Date);
  });

  it("404s when the job does not belong to the caller's org", async () => {
    session("t2");
    db.crmUpworkJob.findFirst.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/upwork/[id]/ai-analysis/route");
    const res = await POST(
      jsonReq("http://test/api/upwork/job1/ai-analysis", "POST", { score: 10 }),
      { params: Promise.resolve({ id: "job1" }) },
    );
    expect(res.status).toBe(404);
  });
});
