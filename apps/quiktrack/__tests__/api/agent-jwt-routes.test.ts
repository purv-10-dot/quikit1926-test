import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { EncryptJWT } from "jose";
import hkdf from "@panva/hkdf";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

import { GET as listProjects } from "@/app/api/projects/route";
import { GET as listIssues } from "@/app/api/issues/route";
import { GET as listSprints } from "@/app/api/sprints/route";
import { GET as getIssue } from "@/app/api/issues/[id]/route";
import { GET as listIssueComments } from "@/app/api/issues/[id]/comments/route";
import { GET as summarizeIssue } from "@/app/api/issues/[id]/summary/route";
import { GET as summarizeSprint } from "@/app/api/sprints/[id]/summary/route";
import { GET as summarizeProject } from "@/app/api/projects/[id]/summary/route";

/**
 * Per-route coverage for the AI Runtime agent-JWT opt-in.
 *
 * Every read operation the manifest declares (`lib/api/aiManifest.ts`,
 * riskClass "read") must accept the platform auth service's agent JWT. The
 * mechanism itself — decryption, claim validation, `actorType: "agent"`,
 * `actingAgentId` — is covered once in `withOrgAuth.test.ts`; what THIS file
 * covers is that each individual route opted in, and that opting in did not
 * make it accept anything else.
 *
 * Each route is asserted three ways:
 *   1. valid agent JWT   → NOT 401 (the handler ran)
 *   2. no Authorization  → 401     (still closed to anonymous callers)
 *   3. expired agent JWT → 401     (verification still applies)
 *
 * On (1): most routes are driven to their own early 404 by mocking the first
 * lookup to null, because a full happy path would need per-route fixtures that
 * test the handler rather than the opt-in. A 404 from the handler body and a
 * 401 from `withOrgAuth` are the exact distinction that matters here.
 *
 * The handler's `ctx.actorType` is not asserted per route — a route handler
 * does not expose its ctx to the caller, and instrumenting eight handlers to
 * observe it would test the instrumentation. It does not need per-route
 * assertion: `resolveAgentJwtIdentity` is the ONLY branch that can produce a
 * non-401 for an agent JWT, and it sets `actorType: "agent"` unconditionally.
 * The last test in this file pins that invariant directly.
 */

const ORG = "org_agent";
const USER = "user_agent";
const AGENT_NEXTAUTH_SECRET = "test-nextauth-secret-for-agent-jwt";

async function mintAgentJwt(ttlSeconds = 300): Promise<string> {
  const key = await hkdf(
    "sha256",
    AGENT_NEXTAUTH_SECRET,
    "",
    "NextAuth.js Generated Encryption Key",
    32,
  );
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT({
    sub: USER,
    orgId: ORG,
    actingAs: "ai_agent",
    actingAgentId: "ai-runtime",
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .encrypt(key);
}

type Handler = (
  req: NextRequest,
  ctx?: { params: Record<string, string> },
) => Promise<Response>;

interface RouteCase {
  /** Manifest operation name, so a failure names the tool that breaks. */
  op: string;
  url: string;
  handler: Handler;
  params?: Record<string, string>;
  /** Mocks that carry the handler to a deterministic early return. */
  arrange: () => void;
  /** Status under a valid agent JWT. Never 401 — that is the point. */
  accepted: number;
}

const CASES: RouteCase[] = [
  {
    op: "list_projects",
    url: "http://localhost/api/projects",
    handler: listProjects as Handler,
    arrange: () => {
      // No `App` row → isQuikTrackAppAdmin() short-circuits false.
      mockDb.app.findUnique.mockResolvedValue(null as never);
      mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
      mockDb.qtProject.count.mockResolvedValue(0 as never);
      mockDb.qtProject.findMany.mockResolvedValue([] as never);
      // listStarredProjectIds()
      mockDb.$queryRaw.mockResolvedValue([] as never);
    },
    // The only case with no early 404 — an empty list is a clean 200.
    accepted: 200,
  },
  {
    op: "list_issues",
    url: "http://localhost/api/issues?projectId=proj_1",
    handler: listIssues as Handler,
    arrange: () => {
      mockDb.qtProject.findFirst.mockResolvedValue(null as never);
    },
    accepted: 404,
  },
  {
    op: "list_sprints",
    url: "http://localhost/api/sprints?projectId=proj_1",
    handler: listSprints as Handler,
    arrange: () => {
      mockDb.qtProject.findFirst.mockResolvedValue(null as never);
    },
    accepted: 404,
  },
  {
    op: "get_issue",
    url: "http://localhost/api/issues/issue_1",
    handler: getIssue as Handler,
    params: { id: "issue_1" },
    arrange: () => {
      mockDb.qtIssue.findFirst.mockResolvedValue(null as never);
    },
    accepted: 404,
  },
  {
    op: "list_issue_comments",
    url: "http://localhost/api/issues/issue_1/comments",
    handler: listIssueComments as Handler,
    params: { id: "issue_1" },
    arrange: () => {
      mockDb.qtIssue.findFirst.mockResolvedValue(null as never);
    },
    accepted: 404,
  },
  {
    op: "summarize_issue",
    url: "http://localhost/api/issues/issue_1/summary",
    handler: summarizeIssue as Handler,
    params: { id: "issue_1" },
    arrange: () => {
      mockDb.qtIssue.findFirst.mockResolvedValue(null as never);
    },
    accepted: 404,
  },
  {
    op: "summarize_sprint",
    url: "http://localhost/api/sprints/sprint_1/summary",
    handler: summarizeSprint as Handler,
    params: { id: "sprint_1" },
    arrange: () => {
      mockDb.qtSprint.findFirst.mockResolvedValue(null as never);
    },
    accepted: 404,
  },
  {
    op: "summarize_project",
    url: "http://localhost/api/projects/proj_1/summary",
    handler: summarizeProject as Handler,
    params: { id: "proj_1" },
    arrange: () => {
      // Resolved inside withProjectAccess, before the handler body — proves the
      // wrapper forwarded allowAgentJwt rather than 401'ing at identity.
      mockDb.qtProject.findFirst.mockResolvedValue(null as never);
    },
    accepted: 404,
  },
];

function request(url: string, token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  resetMockDb();
  // Present but must never be consulted: the agent-JWT branch never falls back
  // to a cookie session, so an anonymous request has to 401 even with one set.
  setSession({ id: USER, orgId: ORG, role: "owner" });
  process.env.NEXTAUTH_SECRET = AGENT_NEXTAUTH_SECRET;
});

afterEach(() => {
  delete process.env.NEXTAUTH_SECRET;
});

describe.each(CASES)("$op — agent JWT opt-in", (route) => {
  it("accepts a valid agent JWT and runs the handler", async () => {
    route.arrange();
    const token = await mintAgentJwt();
    const res = await route.handler(
      request(route.url, token),
      route.params ? { params: route.params } : undefined,
    );
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(route.accepted);
  });

  it("still rejects an unauthenticated request", async () => {
    route.arrange();
    const res = await route.handler(
      request(route.url),
      route.params ? { params: route.params } : undefined,
    );
    expect(res.status).toBe(401);
  });

  it("still rejects an expired agent JWT", async () => {
    route.arrange();
    const token = await mintAgentJwt(-60);
    const res = await route.handler(
      request(route.url, token),
      route.params ? { params: route.params } : undefined,
    );
    expect(res.status).toBe(401);
  });
});

describe("the invariant the per-route tests rely on", () => {
  it("an agent JWT reaching a handler always carries actorType 'agent'", async () => {
    const token = await mintAgentJwt();
    let seenActorType: string | undefined;
    const handler = withOrgAuth(
      async (ctx) => {
        seenActorType = ctx.actorType;
        return NextResponse.json({ success: true });
      },
      { allowAgentJwt: true },
    );
    const res = await handler(request("http://localhost/api/anything", token));
    expect(res.status).toBe(200);
    expect(seenActorType).toBe("agent");
  });
});
