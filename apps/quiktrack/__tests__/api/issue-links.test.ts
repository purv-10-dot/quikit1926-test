import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/issues/[id]/links/route";
import { DELETE } from "@/app/api/issues/[id]/links/[linkId]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const ISSUE = "issue_1";
const TARGET = "issue_2";
const LINK = "link_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/links`);
}
function postReq(body: unknown) {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/links`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function delReq() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/links/${LINK}`, {
    method: "DELETE",
  });
}

const GET_CTX = { params: { id: ISSUE } } as never;
const POST_CTX = { params: { id: ISSUE } } as never;
const DEL_CTX = { params: { id: ISSUE, linkId: LINK } } as never;

describe("GET /api/issues/[id]/links", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(getReq(), GET_CTX);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the issue is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    const res = await GET(getReq(), GET_CTX);
    expect(res.status).toBe(404);
  });

  it("happy path returns both outgoing and incoming links with directional labels", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    // First findMany = outgoing (this is source), second = incoming (this is target).
    mockDb.qtIssueLink.findMany
      .mockResolvedValueOnce([
        {
          id: LINK,
          type: "BLOCKS",
          createdAt: new Date(1),
          targetIssue: { id: TARGET, key: "QT-2", title: "Other" },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "link_2",
          type: "BLOCKS",
          createdAt: new Date(2),
          sourceIssue: { id: "issue_3", key: "QT-3", title: "Upstream" },
        },
      ] as never);
    const res = await GET(getReq(), GET_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    // Outgoing BLOCKS => "blocks"; incoming BLOCKS => "is blocked by".
    const out = body.data.find((r: { id: string }) => r.id === LINK);
    const inc = body.data.find((r: { id: string }) => r.id === "link_2");
    expect(out.label).toBe("blocks");
    expect(out.otherIssue.key).toBe("QT-2");
    expect(inc.label).toBe("is blocked by");
    expect(inc.otherIssue.key).toBe("QT-3");
  });
});

describe("POST /api/issues/[id]/links", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(postReq({ targetIssueId: TARGET }), POST_CTX);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the source issue is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    const res = await POST(postReq({ targetIssueId: TARGET }), POST_CTX);
    expect(res.status).toBe(404);
  });

  it("rejects self-links", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    const res = await POST(postReq({ targetIssueId: ISSUE }), POST_CTX);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the target issue is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        orgId: TENANT,
      } as never) // source
      .mockResolvedValueOnce(null); // target lookup misses (different tenant)
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    const res = await POST(postReq({ targetIssueId: TARGET }), POST_CTX);
    expect(res.status).toBe(404);
  });

  it("returns 409 when the link already exists", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        orgId: TENANT,
      } as never)
      .mockResolvedValueOnce({ id: TARGET, projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssueLink.findFirst.mockResolvedValue({ id: "dup" } as never);
    const res = await POST(postReq({ targetIssueId: TARGET }), POST_CTX);
    expect(res.status).toBe(409);
  });

  it("happy path creates the link with 201 (outward)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        orgId: TENANT,
      } as never)
      .mockResolvedValueOnce({ id: TARGET, projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssueLink.findFirst.mockResolvedValue(null);
    mockDb.qtIssueLink.create.mockResolvedValue({
      id: LINK,
      type: "BLOCKS",
      createdAt: new Date(),
      sourceIssue: { id: ISSUE, key: "QT-1", title: "This" },
      targetIssue: { id: TARGET, key: "QT-2", title: "Other" },
    } as never);
    const res = await POST(
      postReq({ targetIssueId: TARGET, type: "BLOCKS", direction: "OUTWARD" }),
      POST_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(LINK);
    expect(body.data.label).toBe("blocks");
    expect(body.data.otherIssue.key).toBe("QT-2");
    // Stored source is this issue.
    expect(mockDb.qtIssueLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceIssueId: ISSUE, targetIssueId: TARGET }),
      }),
    );
  });

  it("inward direction flips source/target and labels from this issue's side", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        orgId: TENANT,
      } as never)
      .mockResolvedValueOnce({ id: TARGET, projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssueLink.findFirst.mockResolvedValue(null);
    mockDb.qtIssueLink.create.mockResolvedValue({
      id: LINK,
      type: "BLOCKS",
      createdAt: new Date(),
      sourceIssue: { id: TARGET, key: "QT-2", title: "Other" },
      targetIssue: { id: ISSUE, key: "QT-1", title: "This" },
    } as never);
    const res = await POST(
      postReq({ targetIssueId: TARGET, type: "BLOCKS", direction: "INWARD" }),
      POST_CTX,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.label).toBe("is blocked by");
    expect(body.data.otherIssue.key).toBe("QT-2");
    // Stored edge is flipped: the OTHER issue blocks this one.
    expect(mockDb.qtIssueLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceIssueId: TARGET, targetIssueId: ISSUE }),
      }),
    );
  });
});

describe("DELETE /api/issues/[id]/links/[linkId]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await DELETE(delReq(), DEL_CTX);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the link is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssueLink.findFirst.mockResolvedValue(null);
    const res = await DELETE(delReq(), DEL_CTX);
    expect(res.status).toBe(404);
  });

  it("happy path deletes the link", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssueLink.findFirst.mockResolvedValue({
      id: LINK,
      sourceIssueId: ISSUE,
      sourceIssue: { key: "QT-1" },
      targetIssue: { key: "QT-2" },
    } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({ projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssueLink.delete.mockResolvedValue({ id: LINK } as never);
    const res = await DELETE(delReq(), DEL_CTX);
    expect(res.status).toBe(200);
  });

  it("deletes an inbound link from the target side too", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    // This issue is the TARGET of the stored edge (an "is blocked by" row).
    mockDb.qtIssueLink.findFirst.mockResolvedValue({
      id: LINK,
      sourceIssueId: "issue_3",
      sourceIssue: { key: "QT-3" },
      targetIssue: { key: "QT-1" },
    } as never);
    mockDb.qtIssue.findFirst.mockResolvedValue({ projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssueLink.delete.mockResolvedValue({ id: LINK } as never);
    const res = await DELETE(delReq(), DEL_CTX);
    expect(res.status).toBe(200);
  });
});

/**
 * REGRESSION — `[id]` accepts a cuid OR an issue key, and the links route
 * resolves it. Two bugs lived here, and neither surfaced above because every
 * test in this file passes the cuid, where `params.id === issue.id` makes the
 * raw path param and the resolved one indistinguishable:
 *
 *   1. The route called `resolveIssueIdOrKey` without importing it. Every
 *      request threw ReferenceError and came back as
 *      `{ success: false, error: "resolveIssueIdOrKey is not defined" }`.
 *   2. The queries downstream of the lookup reached for `params.id` again. A
 *      key there matches no cuid column: GET returned an empty list inside a
 *      200, and POST wrote the KEY into `sourceIssueId`/`targetIssueId` —
 *      a cuid foreign key — where no constraint catches it.
 *
 * These assert on what the route hands Prisma, not just the status code,
 * because (2) is invisible from the response body.
 */
describe("/api/issues/[id]/links resolves an issue key to its cuid", () => {
  type FindFirstArgs = { where?: Record<string, unknown> };
  type OrClause = { id?: string; key?: string };
  type Mockable = { mockImplementation: (fn: (args: FindFirstArgs) => unknown) => void };

  const ISSUE_KEY = "QT-1";
  const TARGET_KEY = "QT-2";
  const ROWS = [
    { id: ISSUE, key: ISSUE_KEY, projectId: PROJECT },
    { id: TARGET, key: TARGET_KEY, projectId: PROJECT },
  ];

  /**
   * Stands in for the QtIssue table so the resolver's OR(id, key) query and any
   * by-id fetch run against the same data — a route that queried by the raw key
   * would find nothing, exactly as in production.
   */
  function stubIssueTable() {
    (mockDb.qtIssue.findFirst as unknown as Mockable).mockImplementation(
      (args: FindFirstArgs) => {
        const where = args?.where ?? {};
        const or = (where.OR ?? []) as OrClause[];
        const found = ROWS.find((r) =>
          or.length
            ? or.some((c) => c.id === r.id || c.key === r.key)
            : where.id === r.id,
        );
        return Promise.resolve(found ? { ...found, orgId: TENANT } : null);
      },
    );
  }

  function asMember() {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    stubIssueTable();
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  }

  it("GET queries the link table by the resolved cuid, not the key", async () => {
    asMember();
    mockDb.qtIssueLink.findMany.mockResolvedValue([] as never);

    const res = await GET(
      new NextRequest(`http://localhost/api/issues/${ISSUE_KEY}/links`),
      { params: { id: ISSUE_KEY } } as never,
    );

    expect(res.status).toBe(200);
    // Both directions must filter on the cuid. With the key they matched
    // nothing and the caller got an empty list inside a 200.
    const wheres = mockDb.qtIssueLink.findMany.mock.calls.map(
      (c) => (c[0] as { where: Record<string, unknown> }).where,
    );
    expect(wheres).toHaveLength(2);
    expect(wheres[0]).toMatchObject({ sourceIssueId: ISSUE });
    expect(wheres[1]).toMatchObject({ targetIssueId: ISSUE });
    for (const w of wheres) {
      expect(JSON.stringify(w)).not.toContain(ISSUE_KEY);
    }
  });

  it("POST stores cuids in both foreign keys when given keys", async () => {
    asMember();
    mockDb.qtIssueLink.findFirst.mockResolvedValue(null);
    mockDb.qtIssueLink.create.mockResolvedValue({
      id: LINK,
      type: "BLOCKS",
      createdAt: new Date(),
      sourceIssue: { id: ISSUE, key: ISSUE_KEY, title: "This" },
      targetIssue: { id: TARGET, key: TARGET_KEY, title: "Other" },
    } as never);

    const res = await POST(
      new NextRequest(`http://localhost/api/issues/${ISSUE_KEY}/links`, {
        method: "POST",
        body: JSON.stringify({ targetIssueId: TARGET_KEY, type: "BLOCKS" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: ISSUE_KEY } } as never,
    );

    expect(res.status).toBe(201);
    // The row that outlives the request: a key in either column is corruption
    // no constraint would catch.
    expect(mockDb.qtIssueLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceIssueId: ISSUE,
          targetIssueId: TARGET,
          projectId: PROJECT,
        }),
      }),
    );
  });

  it("rejects a self-link when one side is a key and the other its cuid", async () => {
    asMember();

    const res = await POST(
      new NextRequest(`http://localhost/api/issues/${ISSUE_KEY}/links`, {
        method: "POST",
        body: JSON.stringify({ targetIssueId: ISSUE, type: "RELATES_TO" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: ISSUE_KEY } } as never,
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("itself");
    expect(mockDb.qtIssueLink.create).not.toHaveBeenCalled();
  });
});
