import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/timesheets/grid/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function gridReq(qs: string) {
  return new NextRequest(`http://localhost/api/timesheets/grid?${qs}`);
}

const CTX = { params: {} } as never;

const FROM = "2026-05-01T00:00:00.000Z";
const TO = "2026-05-07T00:00:00.000Z";

describe("GET /api/timesheets/grid", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(gridReq(`from=${FROM}&to=${TO}`), CTX);
    expect(res.status).toBe(401);
  });

  it("returns 400 when from/to are missing", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findMany.mockResolvedValue([] as never);
    const res = await GET(gridReq(""), CTX);
    expect(res.status).toBe(400);
  });

  it("rejects scoping to a project the user can't see", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    // Member of nothing.
    mockDb.qtProjectMember.findMany.mockResolvedValue([] as never);
    const res = await GET(
      gridReq(`from=${FROM}&to=${TO}&projectId=${PROJECT}`),
      CTX,
    );
    expect(res.status).toBe(404);
  });

  it("happy path aggregates entries by user and date", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtTimesheetEntry.findMany.mockResolvedValue([
      {
        id: "e1",
        userId: USER,
        projectId: PROJECT,
        issueId: "i1",
        entryDate: new Date("2026-05-02T09:00:00Z"),
        hours: 2,
      },
      {
        id: "e2",
        userId: USER,
        projectId: PROJECT,
        issueId: "i2",
        entryDate: new Date("2026-05-02T13:00:00Z"),
        hours: 1.5,
      },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Test", lastName: "User", email: "t@example.com", avatar: null },
    ] as never);
    const res = await GET(gridReq(`from=${FROM}&to=${TO}&groupBy=user`), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].id).toBe(USER);
    // Both entries on the same day collapse into one cell.
    const cell = body.data.cells[USER];
    const onlyKey = Object.keys(cell)[0];
    expect(cell[onlyKey].hours).toBe(3.5);
    expect(cell[onlyKey].entryIds).toEqual(["e1", "e2"]);
  });
});
