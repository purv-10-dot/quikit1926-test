import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, PUT } from "@/app/api/projects/[id]/board-columns/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function req(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/board-columns`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function asAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
}

function mockGroupBy(rows: Array<{ statusId: string; _count: { _all: number } }>) {
  (mockDb.qtIssue.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(rows);
}

describe("GET /api/projects/:id/board-columns", () => {
  it("401 unauthenticated", async () => {
    const res = await GET(req("GET"), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(401);
  });

  it("returns columns + unmapped statuses + counts", async () => {
    asAdmin();
    mockDb.qtBoardColumn.findMany.mockResolvedValue([
      { id: "c1", name: "To Do", orderIndex: 0, statuses: [{ statusId: "s_todo", orderIndex: 0 }] },
    ] as never);
    mockDb.qtIssueStatus.findMany.mockResolvedValue([
      { id: "s_todo", name: "To Do", color: "#000", category: "BACKLOG" },
      { id: "s_done", name: "Done", color: "#0f0", category: "DONE" },
    ] as never);
    mockGroupBy([{ statusId: "s_todo", _count: { _all: 3 } }]);

    const res = await GET(req("GET"), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.configured).toBe(true);
    expect(body.data.columns[0].statusIds).toEqual(["s_todo"]);
    expect(body.data.unmappedStatusIds).toEqual(["s_done"]);
    expect(body.data.countByStatus.s_todo).toBe(3);
  });

  it("configured=false when no columns exist", async () => {
    asAdmin();
    mockDb.qtBoardColumn.findMany.mockResolvedValue([] as never);
    mockDb.qtIssueStatus.findMany.mockResolvedValue([] as never);
    mockGroupBy([]);
    const res = await GET(req("GET"), { params: { id: PROJECT } } as never);
    const body = await res.json();
    expect(body.data.configured).toBe(false);
  });
});

describe("PUT /api/projects/:id/board-columns", () => {
  it("400 when a status is mapped to two columns", async () => {
    asAdmin();
    mockDb.qtIssueStatus.findMany.mockResolvedValue([{ id: "s1" }] as never);
    const res = await PUT(
      req("PUT", { columns: [{ name: "A", statusIds: ["s1"] }, { name: "B", statusIds: ["s1"] }] }),
      { params: { id: PROJECT } } as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/more than one column/);
  });

  it("400 when a status is not in the project", async () => {
    asAdmin();
    mockDb.qtIssueStatus.findMany.mockResolvedValue([{ id: "s1" }] as never);
    const res = await PUT(
      req("PUT", { columns: [{ name: "A", statusIds: ["ghost"] }] }),
      { params: { id: PROJECT } } as never,
    );
    expect(res.status).toBe(400);
  });

  it("replaces the mapping atomically", async () => {
    asAdmin();
    mockDb.qtIssueStatus.findMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }] as never);
    (mockDb.$transaction as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      (cb: unknown) => {
        const tx = {
          qtBoardColumn: {
            deleteMany: () => Promise.resolve({}),
            create: () => Promise.resolve({ id: "c_new" }),
          },
          qtBoardColumnStatus: { createMany: () => Promise.resolve({}) },
        };
        return (cb as (t: unknown) => Promise<unknown>)(tx);
      },
    );
    const res = await PUT(
      req("PUT", { columns: [{ name: "To Do", statusIds: ["s1"] }, { name: "Done", statusIds: ["s2"] }] }),
      { params: { id: PROJECT } } as never,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.columns).toBe(2);
  });
});
