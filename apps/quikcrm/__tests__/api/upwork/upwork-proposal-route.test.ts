/**
 * POST /api/upwork/[id]/proposal — Connects sourcing rule.
 *
 * The business rule under test: `connectsUsed` is taken from the SELECTED CRM
 * job's own `requiredConnects` (a scraped text column, e.g. "22"), parsed to a
 * number — never from the request body, and never scraped from the proposal
 * page. Everything else about the proposal save is unchanged.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

mockDb();

const job = {
  id: "job-1",
  orgId: "org-1",
  jobTitle: "D365 Sales CRM Setup and Migration",
  jobUrl: "https://www.upwork.com/jobs/~021",
  clientLocation: "United Kingdom",
  requiredConnects: "22",
  createdByUserId: "u1",
};

vi.mock("@/lib/services/upwork/upwork-service", () => ({
  getUpworkJob: vi.fn(async () => job),
  saveUpworkProposal: vi.fn(async () => ({
    ...job,
    proposalId: "p-1",
    connectsUsed: 22,
    boostConnects: null,
    proposalSubmittedAt: null,
    proposalCoverLetter: "Hi Ava, ...",
  })),
}));

vi.mock("@/lib/services/activities/log-upwork-activity", () => ({
  logUpworkActivity: vi.fn(async () => undefined),
}));

vi.mock("@/lib/services/upwork/resolve-upwork-user", () => ({
  resolveUpworkUser: vi.fn(async () => ({ userId: "u1", orgId: "org-1", role: "admin" })),
  upworkOwnerScope: vi.fn(() => undefined),
}));

vi.mock("@/lib/auth/permissions", () => ({ assertModule: vi.fn(async () => undefined) }));

import { getUpworkJob, saveUpworkProposal } from "@/lib/services/upwork/upwork-service";

const ROUTE = "@/app/api/upwork/[id]/proposal/route";

function req(body: unknown) {
  return new Request("http://test/api/upwork/job-1/proposal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const params = Promise.resolve({ id: "job-1" });

beforeEach(() => {
  setSession({ userId: "u1", orgId: "org-1", role: "admin" });
  vi.clearAllMocks();
});

describe("connectsUsed comes from the selected job's requiredConnects", () => {
  it('parses requiredConnects "22" into connectsUsed 22', async () => {
    const { POST } = await import(ROUTE);
    const res = await POST(req({ proposalId: "p-1" }), { params });

    expect(res.status).toBe(200);
    expect(saveUpworkProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ connectsUsed: 22 }),
      }),
    );
  });

  it("ignores a connectsUsed sent in the request body", async () => {
    const { POST } = await import(ROUTE);
    // The extension no longer decides this figure; the job does.
    await POST(req({ proposalId: "p-1", connectsUsed: 999 }), { params });

    const call = vi.mocked(saveUpworkProposal).mock.calls[0][0];
    expect(call.input.connectsUsed).toBe(22);
  });

  it("leaves connectsUsed untouched when requiredConnects is absent", async () => {
    vi.mocked(getUpworkJob).mockResolvedValueOnce({
      ...job,
      requiredConnects: null,
    } as never);
    const { POST } = await import(ROUTE);
    await POST(req({ proposalId: "p-1" }), { params });

    // undefined, NOT 0 — "we do not know" must stay distinguishable from
    // "zero Connects were spent".
    const call = vi.mocked(saveUpworkProposal).mock.calls[0][0];
    expect(call.input.connectsUsed).toBeUndefined();
  });

  it("leaves connectsUsed untouched when requiredConnects is non-numeric", async () => {
    vi.mocked(getUpworkJob).mockResolvedValueOnce({
      ...job,
      requiredConnects: "n/a",
    } as never);
    const { POST } = await import(ROUTE);
    await POST(req({ proposalId: "p-1" }), { params });

    const call = vi.mocked(saveUpworkProposal).mock.calls[0][0];
    expect(call.input.connectsUsed).toBeUndefined();
  });
});

describe("the rest of the proposal save is unchanged", () => {
  it("preserves proposalId, cover letter and boost", async () => {
    const { POST } = await import(ROUTE);
    await POST(
      req({
        proposalId: "p-1",
        proposalCoverLetter: "Hi Ava,\n\nI believe I'm a great fit.",
        boostConnects: 10,
      }),
      { params },
    );

    const call = vi.mocked(saveUpworkProposal).mock.calls[0][0];
    expect(call.input.proposalId).toBe("p-1");
    expect(call.input.proposalCoverLetter).toBe("Hi Ava,\n\nI believe I'm a great fit.");
    // Boost still comes from the extension and is kept separate from the base.
    expect(call.input.boostConnects).toBe(10);
  });

  it("updates in place — no second job row is created", async () => {
    const { POST } = await import(ROUTE);
    await POST(req({ proposalId: "p-1" }), { params });

    // The job is addressed by the path id; the service only ever updates it.
    const call = vi.mocked(saveUpworkProposal).mock.calls[0][0];
    expect(call.id).toBe("job-1");
    expect(call.orgId).toBe("org-1");
  });

  it("404s when the job does not belong to the caller's org", async () => {
    vi.mocked(getUpworkJob).mockResolvedValueOnce(null as never);
    const { POST } = await import(ROUTE);
    const res = await POST(req({ proposalId: "p-1" }), { params });

    expect(res.status).toBe(404);
    expect(saveUpworkProposal).not.toHaveBeenCalled();
  });
});
