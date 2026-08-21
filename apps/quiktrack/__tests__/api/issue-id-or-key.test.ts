import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, PATCH, DELETE } from "@/app/api/issues/[id]/route";
import { POST as LINK_POST } from "@/app/api/issues/[id]/links/route";

/**
 * `/api/issues/[id]` accepts a cuid OR a human-readable issue key.
 *
 * Two properties are under test, and the second matters more than the first:
 *
 *   1. RESOLUTION — a key, in any case, reaches the same issue as its cuid,
 *      and an unknown key (or one in another org) 404s.
 *   2. THE RESOLVED CUID IS WHAT GETS USED — every query and every write
 *      downstream of the lookup receives the cuid, never the caller's key.
 *
 * (2) is the one with teeth. A key leaking past the resolver does not throw:
 * it matches nothing and returns an empty result inside a 200, or it lands in
 * a cuid foreign-key column and corrupts the row. Both were live before this
 * change. `__tests__/unit/issue-id-resolution-guard.test.ts` catches the
 * textual shape; these tests catch the behaviour.
 */

const USER = "user_1";
const ORG = "org_1";
const OTHER_ORG = "org_2";
const PROJECT = "proj_1";

const ISSUE_CUID = "cmsrk1p2h00071tfm9x8lqe4d";
const ISSUE_KEY = "QUIKSC-290";
const TARGET_CUID = "cmsrk1p2h00081tfm9x8lqe4e";
const TARGET_KEY = "QUIKSC-291";

/** A key that exists — in someone else's org. The cross-org leak case. */
const FOREIGN_KEY = "OTHER-1";

type StoredIssue = { id: string; key: string; projectId: string; orgId: string };

const ISSUES: StoredIssue[] = [
  { id: ISSUE_CUID, key: ISSUE_KEY, projectId: PROJECT, orgId: ORG },
  { id: TARGET_CUID, key: TARGET_KEY, projectId: PROJECT, orgId: ORG },
  { id: "cmsrk1p2h00091tfm9x8lqe4f", key: FOREIGN_KEY, projectId: "proj_9", orgId: OTHER_ORG },
];

type FindFirstArgs = { where?: Record<string, unknown> };
type OrClause = { id?: string; key?: string };
type Mockable = { mockImplementation: (fn: (args: FindFirstArgs) => unknown) => void };

/**
 * Stands in for the QtIssue table so both lookups in a request run against the
 * same data: `resolveIssueIdOrKey`'s OR-query and the route's own `where: {id}`
 * fetch. Sequencing `mockResolvedValueOnce` would work too, but would let a
 * route that fetched by the raw key still "pass" — the point is that the
 * second query only finds the row when it is given the cuid.
 */
function seedIssueTable() {
  (mockDb.qtIssue.findFirst as unknown as Mockable).mockImplementation(
    async (args: FindFirstArgs) => {
      const where = args?.where ?? {};
      const orgId = where.orgId as string | undefined;

      // resolveIssueIdOrKey — matches either column, org-scoped.
      if (Array.isArray(where.OR)) {
        const clauses = where.OR as OrClause[];
        const byId = clauses.find((c) => "id" in c)?.id;
        const byKey = clauses.find((c) => "key" in c)?.key;
        const hit = ISSUES.find(
          (i) => i.orgId === orgId && (i.id === byId || i.key === byKey),
        );
        return hit ? { id: hit.id, projectId: hit.projectId } : null;
      }

      // A route's own fetch — by cuid only. A key here finds nothing.
      const hit = ISSUES.find(
        (i) => i.id === where.id && (orgId === undefined || i.orgId === orgId),
      );
      return hit
        ? { ...hit, title: "T", statusId: "status_1", parent: null, epic: null }
        : null;
    },
  );
}

/**
 * Signs in as an org owner. Deliberate: `hasAdminAccess` short-circuits the
 * project-role permission checks, so a 403 cannot mask the thing under test.
 * Permission behaviour on these routes is covered by issue-detail.test.ts and
 * issue-move-security.test.ts — the org scoping that key acceptance actually
 * depends on is asserted directly below, via the resolver's own `orgId`
 * argument and the cross-org 404s.
 */
function asOrgAdmin() {
  setSession({ id: USER, orgId: ORG, role: "owner" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
  mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m", role: "MEMBER" } as never);
}

function getReq(idOrKey: string) {
  return new NextRequest(`http://localhost/api/issues/${idOrKey}`);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
  seedIssueTable();
  mockDb.qtIssue.findMany.mockResolvedValue([] as never);
  mockDb.qtTimesheetEntry.findMany.mockResolvedValue([] as never);
  // The detail panel embeds custom fields in the same round-trip; unstubbed
  // these return undefined and the handler 500s before it reaches anything
  // this file is about.
  mockDb.qtCustomField.findMany.mockResolvedValue([] as never);
  mockDb.qtIssueFieldValue.findMany.mockResolvedValue([] as never);
});

describe("GET /api/issues/[id] — resolution", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(ISSUE_CUID), { params: { id: ISSUE_CUID } } as never);
    expect(res.status).toBe(401);
  });

  it("resolves a cuid", async () => {
    asOrgAdmin();
    const res = await GET(getReq(ISSUE_CUID), { params: { id: ISSUE_CUID } } as never);
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(ISSUE_CUID);
  });

  it("resolves an issue key", async () => {
    asOrgAdmin();
    const res = await GET(getReq(ISSUE_KEY), { params: { id: ISSUE_KEY } } as never);
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(ISSUE_CUID);
  });

  it("resolves a lowercase key (the resolver uppercases before matching)", async () => {
    asOrgAdmin();
    const lower = ISSUE_KEY.toLowerCase();
    const res = await GET(getReq(lower), { params: { id: lower } } as never);
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(ISSUE_CUID);
  });

  it("404s on an unknown key", async () => {
    asOrgAdmin();
    const res = await GET(getReq("NOPE-1"), { params: { id: "NOPE-1" } } as never);
    expect(res.status).toBe(404);
  });

  /**
   * THE IMPORTANT ONE. A key is human-guessable in a way a cuid is not, so key
   * acceptance is only safe while the lookup stays org-scoped. This asserts
   * both the 404 and — separately — that the resolver was handed the caller's
   * own orgId, because a 404 alone would still pass if the scoping were
   * dropped and the key simply did not exist.
   */
  it("404s on a key belonging to another org, and scopes the lookup to the caller's org", async () => {
    asOrgAdmin();
    const res = await GET(getReq(FOREIGN_KEY), { params: { id: FOREIGN_KEY } } as never);
    expect(res.status).toBe(404);

    const resolverCalls = mockDb.qtIssue.findFirst.mock.calls
      .map(([args]) => (args ?? {}) as FindFirstArgs)
      .filter((args) => Array.isArray(args.where?.OR));
    expect(resolverCalls.length).toBeGreaterThan(0);
    for (const args of resolverCalls) {
      expect(args.where?.orgId).toBe(ORG);
    }
  });
});

describe("GET /api/issues/[id] — the resolved cuid is what gets queried", () => {
  /**
   * The silent-200 regression. Both of these queries sit downstream of the
   * lookup and filter by the issue id. Given a key they match nothing and the
   * response is a well-formed 200 with empty subtasks and time logs — the
   * failure mode with no error attached to it.
   */
  it("queries subtasks and time logs by cuid when called with a key", async () => {
    asOrgAdmin();
    const res = await GET(getReq(ISSUE_KEY), { params: { id: ISSUE_KEY } } as never);
    expect(res.status).toBe(200);

    const subtaskCall = mockDb.qtIssue.findMany.mock.calls.at(0)?.[0] as FindFirstArgs;
    expect(subtaskCall.where?.parentId).toBe(ISSUE_CUID);

    const timeLogCall = mockDb.qtTimesheetEntry.findMany.mock.calls.at(0)?.[0] as FindFirstArgs;
    expect(timeLogCall.where?.issueId).toBe(ISSUE_CUID);
  });
});

describe("PATCH /api/issues/[id]", () => {
  function patchReq(idOrKey: string, body: unknown) {
    return new NextRequest(`http://localhost/api/issues/${idOrKey}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("updates by cuid when called with a key", async () => {
    asOrgAdmin();
    mockDb.$transaction.mockImplementation(async (cb: unknown) =>
      (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb),
    );
    mockDb.qtIssue.update.mockResolvedValue({
      id: ISSUE_CUID,
      key: ISSUE_KEY,
      title: "T",
      projectId: PROJECT,
    } as never);

    const res = await PATCH(patchReq(ISSUE_KEY, { title: "Renamed" }), {
      params: { id: ISSUE_KEY },
    } as never);
    expect(res.status).toBe(200);

    const updateArgs = mockDb.qtIssue.update.mock.calls.at(0)?.[0] as {
      where: { id: string };
    };
    expect(updateArgs.where.id).toBe(ISSUE_CUID);
  });

  it("404s on a key belonging to another org", async () => {
    asOrgAdmin();
    const res = await PATCH(patchReq(FOREIGN_KEY, { title: "x" }), {
      params: { id: FOREIGN_KEY },
    } as never);
    expect(res.status).toBe(404);
    expect(mockDb.qtIssue.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/issues/[id]", () => {
  function delReq(idOrKey: string) {
    return new NextRequest(`http://localhost/api/issues/${idOrKey}`, { method: "DELETE" });
  }

  /**
   * The half-applied-write regression. The epic unlink and the subtask cascade
   * both filter by the issue id; given a key they update zero rows and the
   * transaction's final update then throws. Asserting the cuid reaches them
   * pins the whole cascade, not just the row that would have errored.
   */
  it("cascades to children by cuid and returns the cuid, when called with a key", async () => {
    asOrgAdmin();
    mockDb.$transaction.mockImplementation(async (cb: unknown) =>
      (cb as (t: typeof mockDb) => Promise<unknown>)(mockDb),
    );
    mockDb.qtIssue.updateMany.mockResolvedValue({ count: 2 } as never);
    mockDb.qtIssue.update.mockResolvedValue({ id: ISSUE_CUID } as never);

    const res = await DELETE(delReq(ISSUE_KEY), { params: { id: ISSUE_KEY } } as never);
    expect(res.status).toBe(200);

    for (const [args] of mockDb.qtIssue.updateMany.mock.calls) {
      const where = (args as FindFirstArgs).where ?? {};
      const filter = where.parentId ?? where.epicId;
      expect(filter).toBe(ISSUE_CUID);
    }

    // The response id is chained into follow-up calls — it must be the cuid,
    // not the key the caller happened to use.
    expect((await res.json()).data.id).toBe(ISSUE_CUID);
  });
});

describe("POST /api/issues/[id]/links", () => {
  function linkReq(idOrKey: string, body: unknown) {
    return new NextRequest(`http://localhost/api/issues/${idOrKey}/links`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * THE DATA-CORRUPTION CASE. `sourceIssueId` is a cuid foreign key that gets
   * WRITTEN. An unresolved key stored there produces a row pointing at nothing
   * — no constraint rejects it, no request fails, and it survives long after
   * the call that created it. This must fail loudly if anyone reintroduces it.
   */
  it("stores the resolved cuid in sourceIssueId, never the key", async () => {
    asOrgAdmin();
    mockDb.qtIssueLink.findFirst.mockResolvedValue(null);
    mockDb.qtIssueLink.create.mockResolvedValue({
      id: "link_1",
      type: "RELATES_TO",
      createdAt: new Date(),
      targetIssue: { id: TARGET_CUID, key: TARGET_KEY, title: "T2", status: null },
    } as never);

    const res = await LINK_POST(linkReq(ISSUE_KEY, { targetIssueId: TARGET_KEY }), {
      params: { id: ISSUE_KEY },
    } as never);
    expect(res.status).toBe(201);

    const createArgs = mockDb.qtIssueLink.create.mock.calls.at(0)?.[0] as {
      data: { sourceIssueId: string; targetIssueId: string };
    };
    expect(createArgs.data.sourceIssueId).toBe(ISSUE_CUID);
    expect(createArgs.data.targetIssueId).toBe(TARGET_CUID);
  });

  /**
   * The self-link guard compares the two sides. Before resolution it compared
   * raw arguments, so spelling one side as a key and the other as a cuid
   * walked straight past it and linked an issue to itself.
   */
  it("rejects a self-link where one side is a key and the other a cuid", async () => {
    asOrgAdmin();
    const res = await LINK_POST(linkReq(ISSUE_KEY, { targetIssueId: ISSUE_CUID }), {
      params: { id: ISSUE_KEY },
    } as never);
    expect(res.status).toBe(400);
    expect(mockDb.qtIssueLink.create).not.toHaveBeenCalled();
  });

  it("404s when the target key belongs to another org", async () => {
    asOrgAdmin();
    const res = await LINK_POST(linkReq(ISSUE_KEY, { targetIssueId: FOREIGN_KEY }), {
      params: { id: ISSUE_KEY },
    } as never);
    expect(res.status).toBe(404);
    expect(mockDb.qtIssueLink.create).not.toHaveBeenCalled();
  });
});
