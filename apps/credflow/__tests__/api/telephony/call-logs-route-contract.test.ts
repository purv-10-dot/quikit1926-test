/**
 * FR-RE Stage 3-B/C — POST /api/telephony/call-logs Option-Y wire contract.
 *
 * Option Y: the agent saves from STATUS; the disposition is internal plumbing.
 *   - callDispositionId becomes OPTIONAL (a blank/absent body must NOT be 400'd
 *     by the schema — createCallLog resolves the internal "Call" disposition).
 *   - status becomes REQUIRED (z.string().min(1)) — a save with no status is
 *     meaningless and must 400.
 *
 * We mock createCallLog so this asserts the ROUTE SCHEMA gate only (the engine's
 * no-disposition behavior is covered by status-save.integration.test.ts).
 *
 * RED until Stage 3-B: the schema still has callDispositionId: z.string().min(1)
 * and status optional — so the no-disposition body 400s, and the no-status body
 * is (wrongly) accepted.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

mockDb();

// Mock the engine — we are testing the route's Zod gate, not createCallLog.
vi.mock("@/lib/services/telephony/disposition-engine", () => ({
  createCallLog: vi.fn(async () => ({
    id: "cl_1",
    dispositionName: "Call",
    paymentVerificationRequired: false,
    linkedLeadId: "lead_1",
  })),
}));

function postReq(body: unknown) {
  return new Request("http://test/api/telephony/call-logs", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession({ userId: "u1", tenantId: "t1", name: "Dev Pallav" });
});

describe("POST /api/telephony/call-logs — Option-Y contract", () => {
  it("accepts a body with NO callDispositionId but WITH a status (201, not 400)", async () => {
    const { POST } = await import("@/app/api/telephony/call-logs/route");
    // source supplied (required since 3-D) so the only relaxation under test is
    // the absent callDispositionId.
    const res = await POST(postReq({ source: "manual", toNumber: "9888800001", status: "Renewal Done" }));
    expect(res.status).toBe(201);
  });

  it("rejects a body with NO status (400 — status is the required pick)", async () => {
    const { POST } = await import("@/app/api/telephony/call-logs/route");
    // Include callDispositionId + source so the ONLY thing that can 400 this body
    // is the missing status — otherwise it would 400 for an unrelated missing
    // field (a false green that can't catch the status rule).
    const res = await POST(postReq({ source: "manual", toNumber: "9888800002", callDispositionId: "disp_1" }));
    expect(res.status).toBe(400);
  });

  it("rejects a body with NO source (400 — source is required, never inferred) [3-D]", async () => {
    const { POST } = await import("@/app/api/telephony/call-logs/route");
    const res = await POST(postReq({ toNumber: "9888800004", status: "Renewal Done" }));
    expect(res.status).toBe(400);
  });
});
