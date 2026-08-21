import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { EncryptJWT } from "jose";
import hkdf from "@panva/hkdf";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { MANIFEST_OPERATIONS } from "@/lib/api/aiManifest";

import { POST as createIssue } from "@/app/api/issues/route";
import { PATCH as updateIssue, DELETE as deleteIssue } from "@/app/api/issues/[id]/route";
import { PATCH as moveIssue } from "@/app/api/issues/[id]/move/route";
import { POST as addIssueComment } from "@/app/api/issues/[id]/comments/route";
import { POST as linkIssues } from "@/app/api/issues/[id]/links/route";
import { POST as createSprint } from "@/app/api/sprints/route";
import { PATCH as updateSprint } from "@/app/api/sprints/[id]/route";
import { PATCH as startSprint } from "@/app/api/sprints/[id]/start/route";
import { POST as completeSprint } from "@/app/api/sprints/[id]/complete/route";
import { POST as createProject } from "@/app/api/projects/route";
import { POST as logTime } from "@/app/api/timesheets/route";

/**
 * Per-route coverage for the agent-JWT opt-in on WRITE operations — the
 * companion to `agent-jwt-routes.test.ts`, which covers the eight reads.
 *
 * Sibling file, not a new block in that one, because the two suites pin
 * different invariants: the read suite's whole point is that opting in did not
 * cost the browser app its access, while this one's is that a write reaches
 * QuikTrack only behind an identity the runtime's approval gate has stamped.
 *
 * Every operation the manifest declares with a non-"read" riskClass must accept
 * the platform auth service's agent JWT — EXCEPT `link_issues`, which the
 * runtime refuses to register because it declares `requiredPermission: null`
 * (see aiManifest.ts) and which therefore must NOT be opted in. The last two
 * describes pin both halves of that rule.
 *
 * Each route is asserted four ways, mirroring the read suite:
 *   1. valid agent JWT          → NOT 401 (the handler ran)
 *   2. session, no bearer       → NOT 401 (the browser app still works)
 *   3. no session, no bearer    → 401     (still closed to anonymous callers)
 *   4. expired agent JWT        → 401     (verification still applies)
 *
 * On (1): each route is driven to its own deterministic early return — a 404
 * from a first lookup mocked to null, a 400 from its Zod schema, or a 403 from
 * its permission gate. A real happy path would need per-route fixtures that
 * test the handler rather than the opt-in. The distinction that matters here is
 * only ever "a status from the handler body" vs "401 from withOrgAuth".
 *
 * `ctx.actorType` is not asserted per route, for the reason the read suite
 * states: a handler does not expose its ctx, `resolveAgentJwtIdentity` is the
 * only branch that can produce a non-401 for an agent JWT, and it sets
 * `actorType: "agent"` unconditionally. That invariant is pinned directly at
 * the end of `agent-jwt-routes.test.ts`.
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
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  handler: Handler;
  params?: Record<string, string>;
  /** JSON body, for the routes that parse one before their early return. */
  body?: string;
  /** Mocks that carry the handler to a deterministic early return. */
  arrange: () => void;
  /** Status under a valid agent JWT. Never 401 — that is the point. */
  accepted: number;
}

/** No issue row → every issue-scoped write returns its own 404. */
const noIssue = () => {
  mockDb.qtIssue.findFirst.mockResolvedValue(null as never);
};

/** No sprint row → every sprint-scoped write returns its own 404. */
const noSprint = () => {
  mockDb.qtSprint.findFirst.mockResolvedValue(null as never);
};

const CASES: RouteCase[] = [
  {
    op: "create_issue",
    method: "POST",
    url: "http://localhost/api/issues",
    handler: createIssue as Handler,
    // Empty body fails createIssueSchema before any lookup runs.
    body: "{}",
    arrange: () => {},
    accepted: 400,
  },
  {
    op: "update_issue",
    method: "PATCH",
    url: "http://localhost/api/issues/issue_1",
    handler: updateIssue as Handler,
    params: { id: "issue_1" },
    arrange: noIssue,
    accepted: 404,
  },
  {
    op: "delete_issue",
    method: "DELETE",
    url: "http://localhost/api/issues/issue_1",
    handler: deleteIssue as Handler,
    params: { id: "issue_1" },
    arrange: noIssue,
    accepted: 404,
  },
  {
    op: "move_issue",
    method: "PATCH",
    url: "http://localhost/api/issues/issue_1/move",
    handler: moveIssue as Handler,
    params: { id: "issue_1" },
    arrange: noIssue,
    accepted: 404,
  },
  {
    op: "add_issue_comment",
    method: "POST",
    url: "http://localhost/api/issues/issue_1/comments",
    handler: addIssueComment as Handler,
    params: { id: "issue_1" },
    body: JSON.stringify({ body: "hello" }),
    // loadAccessibleIssue's own qtIssue lookup returns null → 404.
    arrange: noIssue,
    accepted: 404,
  },
  {
    op: "create_sprint",
    method: "POST",
    url: "http://localhost/api/sprints",
    handler: createSprint as Handler,
    body: "{}",
    arrange: () => {},
    accepted: 400,
  },
  {
    op: "update_sprint",
    method: "PATCH",
    url: "http://localhost/api/sprints/sprint_1",
    handler: updateSprint as Handler,
    params: { id: "sprint_1" },
    body: "{}",
    arrange: noSprint,
    accepted: 404,
  },
  {
    op: "start_sprint",
    method: "PATCH",
    url: "http://localhost/api/sprints/sprint_1/start",
    handler: startSprint as Handler,
    params: { id: "sprint_1" },
    arrange: noSprint,
    accepted: 404,
  },
  {
    op: "complete_sprint",
    method: "POST",
    url: "http://localhost/api/sprints/sprint_1/complete",
    handler: completeSprint as Handler,
    params: { id: "sprint_1" },
    body: "{}",
    arrange: noSprint,
    accepted: 404,
  },
  {
    op: "create_project",
    method: "POST",
    url: "http://localhost/api/projects",
    handler: createProject as Handler,
    body: "{}",
    // No `App` row → getQuikTrackAppId() returns null → userCan() is false, so
    // the route's permission gate answers before its Zod schema does.
    arrange: () => {
      mockDb.app.findUnique.mockResolvedValue(null as never);
    },
    accepted: 403,
  },
  {
    op: "log_time",
    method: "POST",
    url: "http://localhost/api/timesheets",
    handler: logTime as Handler,
    body: "{}",
    arrange: () => {},
    accepted: 400,
  },
];

function request(
  route: Pick<RouteCase, "url" | "method" | "body">,
  token?: string,
): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (route.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(route.url, {
    method: route.method,
    headers,
    ...(route.body !== undefined ? { body: route.body } : {}),
  });
}

function invoke(route: RouteCase, token?: string): Promise<Response> {
  return route.handler(
    request(route, token),
    route.params ? { params: route.params } : undefined,
  );
}

beforeEach(() => {
  resetMockDb();
  // The default identity. Deliberately NOT consulted on the agent-JWT cases (a
  // bearer short-circuits to that branch), and IS the identity for the session
  // case. The anonymous case clears it.
  setSession({ id: USER, orgId: ORG, role: "owner" });
  process.env.NEXTAUTH_SECRET = AGENT_NEXTAUTH_SECRET;
});

afterEach(() => {
  delete process.env.NEXTAUTH_SECRET;
});

describe.each(CASES)("$op — agent JWT opt-in", (route) => {
  it("accepts a valid agent JWT and runs the handler", async () => {
    route.arrange();
    const res = await invoke(route, await mintAgentJwt());
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(route.accepted);
  });

  it("still serves a logged-in session caller with no bearer token", async () => {
    route.arrange();
    const res = await invoke(route);
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(route.accepted);
  });

  it("rejects a genuinely anonymous request — no session, no bearer", async () => {
    setSession(null);
    route.arrange();
    const res = await invoke(route);
    expect(res.status).toBe(401);
  });

  it("still rejects an expired agent JWT", async () => {
    route.arrange();
    const res = await invoke(route, await mintAgentJwt(-60));
    expect(res.status).toBe(401);
  });
});

/**
 * The half of the rule that is an omission, and so would otherwise be pinned by
 * nothing. `link_issues` declares `requiredPermission: null`, the runtime
 * refuses to register it, and it must stay un-opted-in: an agent JWT on it is
 * just an unrecognized bearer token.
 */
describe("link_issues — deliberately NOT opted in", () => {
  it("rejects a valid agent JWT, because the route never asked for one", async () => {
    const res = await linkIssues(
      request(
        {
          url: "http://localhost/api/issues/issue_1/links",
          method: "POST",
          body: JSON.stringify({ targetIssueId: "issue_2" }),
        },
        await mintAgentJwt(),
      ),
      { params: { id: "issue_1" } },
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
  });

  it("still serves a logged-in session caller", async () => {
    noIssue();
    const res = await linkIssues(
      request({
        url: "http://localhost/api/issues/issue_1/links",
        method: "POST",
        body: JSON.stringify({ targetIssueId: "issue_2" }),
      }),
      { params: { id: "issue_1" } },
    );
    expect(res.status).not.toBe(401);
  });
});

/**
 * ANTI-DRIFT. The table above is hand-written; the manifest is what the runtime
 * actually registers from. This is the assertion that would have caught the
 * list this work started from, which named two operations (`create_doc`,
 * `update_doc`) that exist in no manifest and omitted two that do
 * (`move_issue`, `start_sprint`).
 */
describe("the write set matches the manifest", () => {
  const manifestWrites = MANIFEST_OPERATIONS.filter((o) => o.riskClass !== "read").map((o) => o.name);

  it("covers every manifest write except link_issues, and nothing else", () => {
    expect([...CASES.map((c) => c.op)].sort()).toEqual(
      manifestWrites.filter((n) => n !== "link_issues").sort(),
    );
  });

  it("link_issues is a manifest write, and is excluded on purpose", () => {
    expect(manifestWrites).toContain("link_issues");
    expect(CASES.map((c) => c.op)).not.toContain("link_issues");
  });
});
