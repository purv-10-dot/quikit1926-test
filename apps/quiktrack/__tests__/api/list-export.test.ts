import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/projects/[id]/list-export/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq(query = "") {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT}/list-export${query ? `?${query}` : ""}`,
  );
}

const ROUTE_CTX = { params: { id: PROJECT } } as never;

/** Wire up the mocks for a non-admin project member (org member, not app admin). */
function asProjectMember() {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  // withProjectAccess resolves the project, then checks org-admin, app-admin,
  // then project membership.
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
  mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
  mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
}

describe("GET /api/projects/[id]/list-export", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 (org isolation) when the project is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    // A cross-tenant project id resolves to null under the caller's orgId.
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(404);
  });

  it("happy path: returns CSV of all matching issues (fields=all)", async () => {
    asProjectMember();
    // Second qtProject.findFirst (inside the handler) resolves the projectKey.
    mockDb.qtProject.findFirst
      .mockResolvedValueOnce({ id: PROJECT } as never) // withProjectAccess resolve
      .mockResolvedValueOnce({ projectKey: "QT" } as never); // handler projectKey
    mockDb.qtIssue.findMany.mockResolvedValue([
      {
        id: "issue_1",
        key: "QT-1",
        title: "First task",
        type: "TASK",
        statusId: "s1",
        priority: "HIGH",
        assigneeId: null,
        reporterId: null,
        storyPoints: 3,
        eta: 8,
        startDate: null,
        dueDate: new Date("2026-06-15T00:00:00Z"),
        createdAt: new Date("2026-06-01T00:00:00Z"),
        updatedAt: new Date("2026-06-10T00:00:00Z"),
        description: "Do the thing",
        status: { name: "To Do", category: "BACKLOG" },
      },
    ] as never);
    // fields=all loads custom field defs (none here).
    mockDb.qtCustomField.findMany.mockResolvedValue([] as never);
    mockDb.user.findMany.mockResolvedValue([] as never);

    const res = await GET(getReq("fields=all&format=csv"), ROUTE_CTX);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(
      'filename="quiktrack-QT-export-',
    );
    const text = await res.text();
    // No BOM for plain csv.
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    const [headerLine, firstRow] = text.split("\r\n");
    expect(headerLine).toContain("Key");
    expect(headerLine).toContain("Description");
    expect(firstRow).toContain("QT-1");
    expect(firstRow).toContain("First task");
    expect(firstRow).toContain("Do the thing");
  });

  it("format=excel prepends a UTF-8 BOM", async () => {
    asProjectMember();
    mockDb.qtProject.findFirst
      .mockResolvedValueOnce({ id: PROJECT } as never)
      .mockResolvedValueOnce({ projectKey: "QT" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    mockDb.qtCustomField.findMany.mockResolvedValue([] as never);
    mockDb.user.findMany.mockResolvedValue([] as never);

    const res = await GET(getReq("format=excel"), ROUTE_CTX);
    expect(res.status).toBe(200);
    // Response.text() strips a leading BOM on decode, so inspect the raw bytes:
    // a UTF-8 BOM is the 3-byte sequence EF BB BF.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("fields=visible honours the columns list", async () => {
    asProjectMember();
    mockDb.qtProject.findFirst
      .mockResolvedValueOnce({ id: PROJECT } as never)
      .mockResolvedValueOnce({ projectKey: "QT" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([
      {
        id: "issue_1",
        key: "QT-1",
        title: "First task",
        type: "TASK",
        statusId: "s1",
        priority: "HIGH",
        assigneeId: null,
        reporterId: null,
        storyPoints: null,
        eta: null,
        startDate: null,
        dueDate: null,
        createdAt: new Date("2026-06-01T00:00:00Z"),
        updatedAt: new Date("2026-06-10T00:00:00Z"),
        description: "Do the thing",
        status: { name: "To Do", category: "BACKLOG" },
      },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([] as never);

    const res = await GET(getReq("fields=visible&columns=key,title"), ROUTE_CTX);
    expect(res.status).toBe(200);
    const text = await res.text();
    const [headerLine] = text.split("\r\n");
    expect(headerLine).toBe("Key,Work item");
    // Description is not in the visible column list, so it must not appear.
    expect(headerLine).not.toContain("Description");
  });
});
