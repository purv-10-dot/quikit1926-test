import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/projects/[id]/workflow-scheme/enable/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function req() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/workflow-scheme/enable`, {
    method: "POST",
  });
}

/** withProjectAccess: project in org + admin caller. */
function asAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
}

describe("POST /api/projects/:id/workflow-scheme/enable", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(req(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(401);
  });

  it("404 when the project is not in the caller's org", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await POST(req(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(404);
  });

  it("already-enabled — reports alreadyEnabled and backfills board columns", async () => {
    asAdmin();
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue({ id: "sch1" } as never);
    // The alreadyEnabled branch runs seedBoardColumns inside $transaction. Stub
    // the tx so an existing column short-circuits (no columns are created).
    mockDb.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        qtBoardColumn: {
          findFirst: () => Promise.resolve({ id: "col1" }), // columns exist → no-op
          create: () => Promise.resolve({ id: "colX" }),
        },
        qtIssueStatus: { findMany: () => Promise.resolve([]) },
        qtBoardColumnStatus: { create: () => Promise.resolve({}) },
      };
      return (cb as (t: unknown) => Promise<unknown>)(tx);
    });
    const res = await POST(req(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.alreadyEnabled).toBe(true);
    expect(mockDb.$transaction).toHaveBeenCalled();
  });

  it("provisions a scheme when none exists", async () => {
    asAdmin();
    mockDb.qtWorkflowScheme.findUnique.mockResolvedValue(null);
    // seedProjectWorkflow runs inside $transaction — stub it to a no-op runner.
    mockDb.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        qtResolution: { createMany: () => Promise.resolve({}) },
        // seedProjectWorkflow calls seedBoardColumns first — no existing columns
        // → it creates the 4 defaults + maps same-name/classic statuses.
        qtBoardColumn: {
          findFirst: () => Promise.resolve(null),
          create: () => Promise.resolve({ id: "colX" }),
        },
        qtBoardColumnStatus: { create: () => Promise.resolve({}) },
        qtWorkflowScheme: {
          findUnique: () => Promise.resolve(null),
          create: () => Promise.resolve({ id: "sch1" }),
        },
        qtIssueStatus: { findMany: () => Promise.resolve([]) },
        qtWorkflow: { create: () => Promise.resolve({ id: "wf1" }), update: () => Promise.resolve({}) },
        qtWorkflowStatus: { createMany: () => Promise.resolve({}) },
        qtWorkflowTransition: { create: () => Promise.resolve({ id: "t1" }) },
        qtWorkflowTransitionFrom: { createMany: () => Promise.resolve({}) },
        qtWorkflowSchemeItem: { create: () => Promise.resolve({}) },
      };
      return (cb as (t: unknown) => Promise<unknown>)(tx);
    });

    const res = await POST(req(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.enabled).toBe(true);
  });
});
