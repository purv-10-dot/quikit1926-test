/**
 * FR-RE Stage 1 — GET /api/forms/disposition-statuses route gating.
 *
 * Agent-facing (the agent form + rule-builder read it): requires auth, but NOT
 * the settings gate. We assert it rejects an unauthenticated request (401).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

mockDb();

beforeEach(() => {
  setSession(null);
});

describe("GET /api/forms/disposition-statuses — gating", () => {
  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/forms/disposition-statuses/route");
    const req = new Request("http://test/api/forms/disposition-statuses") as unknown as import("next/server").NextRequest;
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
