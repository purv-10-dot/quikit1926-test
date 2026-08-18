import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/filters/[id]/route";

const USER = "user_1";
const ORG = "org_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function req(qs: string) {
  return new NextRequest(`http://localhost/api/filters/all${qs}`);
}

function asAdmin() {
  setSession({ id: USER, orgId: ORG, role: "owner" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
}

function asMember() {
  setSession({ id: USER, orgId: ORG, role: "member" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  mockDb.qtUserAppRole.findFirst.mockResolvedValue(null as never);
}

function mockEmptyResults() {
  mockDb.qtIssue.findMany.mockResolvedValue([] as never);
  mockDb.qtIssue.count.mockResolvedValue(0 as never);
  mockDb.qtIdea.findMany.mockResolvedValue([] as never);
  mockDb.qtIdea.count.mockResolvedValue(0 as never);
  mockDb.user.findMany.mockResolvedValue([] as never);
  mockDb.qtCustomField.findMany.mockResolvedValue([] as never);
}

describe("GET /api/filters/[id] — tql param", () => {
  it("401 unauthenticated", async () => {
    mockEmptyResults();
    const res = await GET(req('?tql=status="Done"'), { params: { id: "all" } } as never);
    expect(res.status).toBe(401);
  });

  it("403 when a non-admin passes ?tql=", async () => {
    asMember();
    mockEmptyResults();
    const res = await GET(req('?tql=status="Done"'), { params: { id: "all" } } as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/admin-only/);
  });

  it("400 when tql is set but id isn't 'all'", async () => {
    asAdmin();
    mockEmptyResults();
    const res = await GET(req('?tql=status="Done"'), { params: { id: "my-open" } } as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/"all"/);
  });

  it("400 with a position on malformed tql", async () => {
    asAdmin();
    mockEmptyResults();
    const res = await GET(req("?tql=status ="), { params: { id: "all" } } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.position).toBeDefined();
  });

  it("400 with a clear message for an unsupported field", async () => {
    asAdmin();
    mockEmptyResults();
    const res = await GET(req('?tql=labels="x"'), { params: { id: "all" } } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cf\[/);
  });

  it("happy path: admin's valid tql query returns issues scoped to their org", async () => {
    asAdmin();
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "i1", key: "QT-1", title: "Fix bug", type: "BUG", priority: "HIGH", assigneeId: null, reporterId: null, statusId: "s1", parentId: null, epicId: null, sprintId: null, startDate: null, dueDate: null, storyPoints: null, eta: null, createdAt: new Date(), updatedAt: new Date(), project: { id: "p1", name: "Proj", projectKey: "QT" }, status: { id: "s1", name: "Done", color: "#000", category: "DONE" } },
    ] as never);
    mockDb.qtIssue.count.mockResolvedValue(1 as never);
    mockDb.qtIdea.findMany.mockResolvedValue([] as never);
    mockDb.qtIdea.count.mockResolvedValue(0 as never);
    mockDb.user.findMany.mockResolvedValue([] as never);
    mockDb.qtCustomField.findMany.mockResolvedValue([] as never);

    const res = await GET(req('?tql=status="Done"'), { params: { id: "all" } } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].key).toBe("QT-1");

    // org-isolation: the where passed to Prisma always carries this session's
    // orgId, regardless of what the tql query itself asked for.
    const call = mockDb.qtIssue.findMany.mock.calls[0]![0]!;
    expect(call.where).toMatchObject({ orgId: ORG, isDeleted: false });
  });

  it("org isolation: a tql query cannot smuggle a different orgId into the where clause", async () => {
    asAdmin();
    mockEmptyResults();
    // "project" only accepts a bare literal (no field-to-field comparison in
    // this grammar), so there's no syntax for injecting orgId directly — this
    // asserts the route's own orgId always wins regardless of tql content.
    await GET(req('?tql=project="other-org-project"'), { params: { id: "all" } } as never);
    const call = mockDb.qtIssue.findMany.mock.calls[0]![0]!;
    expect(call.where!.orgId).toBe(ORG);
  });

  it("skips Discovery idea merging when tql is set", async () => {
    asAdmin();
    mockEmptyResults();
    await GET(req('?tql=status="Done"'), { params: { id: "all" } } as never);
    expect(mockDb.qtIdea.findMany).not.toHaveBeenCalled();
  });

  it("resolves cf[\"Name\"] against the org's custom fields and applies the type-aware operator", async () => {
    asAdmin();
    mockEmptyResults();
    mockDb.qtCustomField.findMany.mockResolvedValue([
      { id: "field-1", name: "Story Points Estimate", type: "NUMBER" },
    ] as never);

    await GET(req('?tql=cf["Story Points Estimate"] > "3"'), { params: { id: "all" } } as never);

    const call = mockDb.qtIssue.findMany.mock.calls[0]![0]!;
    expect(call.where).toMatchObject({
      fieldValues: { some: { fieldId: "field-1", valueNumber: { gt: 3 } } },
    });
  });

  it("400s with a clear message when cf[...] references an unknown field", async () => {
    asAdmin();
    mockEmptyResults();
    const res = await GET(req('?tql=cf["Nope"] = "x"'), { params: { id: "all" } } as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown custom field/);
  });
});

describe("GET /api/filters/[id] — unaffected when tql is absent", () => {
  it("still 401s unauthenticated for the plain slug path", async () => {
    const res = await GET(req(""), { params: { id: "all" } } as never);
    expect(res.status).toBe(401);
  });

  it("200s for a normal member on the plain 'all' slug (no admin gate without tql)", async () => {
    asMember();
    mockEmptyResults();
    const res = await GET(req(""), { params: { id: "all" } } as never);
    expect(res.status).toBe(200);
  });
});
