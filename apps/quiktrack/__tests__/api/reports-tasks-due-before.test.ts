import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/reports/tasks/route";

// groupBy's generic overload signature is too complex for vitest-mock-extended
// to expose a directly-callable mockResolvedValue on — cast through `unknown`
// to a plain resolved-value mock fn, same shape every other mocked method has.
type ResolvableMock = { mockResolvedValue: (v: unknown) => void };
const qtIssueGroupBy = mockDb.qtIssue.groupBy as unknown as ResolvableMock;
const qtTimesheetGroupBy = mockDb.qtTimesheetEntry.groupBy as unknown as ResolvableMock;

const USER = "user_1";
const ORG = "org_1";

function req(query: string) {
  return new NextRequest(`http://localhost/api/reports/tasks?${query}`);
}

beforeEach(() => {
  resetMockDb();
  setSession({ id: USER, orgId: ORG, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  mockDb.qtIssue.count.mockResolvedValue(0);
  mockDb.qtIssue.aggregate.mockResolvedValue({ _sum: { eta: null } } as never);
  mockDb.qtTimesheetEntry.aggregate.mockResolvedValue({ _sum: { hours: null } } as never);
  mockDb.qtIssue.findMany.mockResolvedValue([]);
  qtIssueGroupBy.mockResolvedValue([]);
  // Second-wave hydration batch — always runs regardless of task count, so
  // it needs a resolved value even when the page itself is empty.
  mockDb.qtProject.findMany.mockResolvedValue([]);
  mockDb.qtIssueStatus.findMany.mockResolvedValue([]);
  mockDb.user.findMany.mockResolvedValue([]);
  qtTimesheetGroupBy.mockResolvedValue([]);
});

describe("GET /api/reports/tasks — dueBefore filter (task.overdue_brief support)", () => {
  it("adds a dueDate lt filter to the where clause when dueBefore is a valid date", async () => {
    const res = await GET(req("dueBefore=2026-08-12T00:00:00.000Z"));
    expect(res.status).toBe(200);
    const call = mockDb.qtIssue.count.mock.calls[0]![0] as { where: { dueDate?: { lt: Date } } };
    expect(call.where.dueDate).toEqual({ lt: new Date("2026-08-12T00:00:00.000Z") });
  });

  it("applies the same dueBefore filter consistently across the count, aggregate, and findMany calls", async () => {
    await GET(req("dueBefore=2026-08-12T00:00:00.000Z"));
    const countWhere = (mockDb.qtIssue.count.mock.calls[0]![0] as { where: unknown }).where;
    const findManyWhere = (mockDb.qtIssue.findMany.mock.calls[0]![0] as { where: unknown }).where;
    expect(findManyWhere).toEqual(countWhere);
  });

  it("ignores an invalid dueBefore value rather than filtering out everything", async () => {
    await GET(req("dueBefore=not-a-date"));
    const call = mockDb.qtIssue.count.mock.calls[0]![0] as { where: { dueDate?: unknown } };
    expect(call.where).not.toHaveProperty("dueDate");
  });

  it("applies no dueDate filter when dueBefore is absent (existing behaviour unchanged)", async () => {
    await GET(req(""));
    const call = mockDb.qtIssue.count.mock.calls[0]![0] as { where: { dueDate?: unknown } };
    expect(call.where).not.toHaveProperty("dueDate");
  });

  it("composes with an existing filter (assigneeId) rather than replacing it", async () => {
    await GET(req("dueBefore=2026-08-12T00:00:00.000Z&assigneeId=user_9"));
    const call = mockDb.qtIssue.count.mock.calls[0]![0] as {
      where: { dueDate?: { lt: Date }; assigneeId?: string };
    };
    expect(call.where.dueDate).toEqual({ lt: new Date("2026-08-12T00:00:00.000Z") });
    expect(call.where.assigneeId).toBe("user_9");
  });
});
