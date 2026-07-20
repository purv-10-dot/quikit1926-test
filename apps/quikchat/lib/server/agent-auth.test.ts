import "../../__tests__/helpers/mockDb";
// NOTE: This file previously tested the inbound agent-JWT verify path
// (mintAgent → Bearer → resolveActor → AgentJwtIssuance audit). That mechanism
// was retired in Batch 3 — QuikIT's withAuth owns agent-token verification, and
// resolveActor now reads ctx.actingAs (throws, never returns null; no audit row).
// Those tests were dropped as no longer meaningful. Two follow-ups are PARKED:
//  (a) a unit test for the new resolveActor contract (mock @quikit/auth/with-auth
//      → ai_agent / human ctx → assert OrgActor mapping + throws-not-null);
//  (b) re-cover the agent cross-org 404 invariant (assertAgentReadAccess).
// Retained below: the manifest gate tests, which exercise current behavior.
import { describe, expect, it } from "vitest";
import { GET as manifestGet } from "@/app/api/internal/manifest/route";

describe("GET /api/internal/manifest", () => {
  it("401 without auth", async () => {
    expect((await manifestGet(new Request("http://t/api/internal/manifest"))).status).toBe(401);
  });

  it("200 with the internal secret", async () => {
    const res = await manifestGet(
      new Request("http://t/api/internal/manifest", {
        headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET! },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { app: string; capabilities: string[] };
    expect(body.app).toBe("quikchat");
    expect(body.capabilities).toContain("accept_agent_jwt");
  });
});
