import { describe, expect, it } from "vitest";
import { buildCaseWhere } from "@/lib/test/caseFilterQuery";
import { UNASSIGNED } from "@/lib/test/caseFilters";
import { listTestCasesSchema } from "@/lib/validation/testCase";

/**
 * QUIKTR-341 — test case filters.
 *
 * These assertions target the parts of `buildCaseWhere` that are easy to get subtly
 * wrong: multi-value ANY semantics, the run+status share-one-`some` requirement, the
 * defect "no" clause needing `none` at the OUTER level, and date-range inclusivity.
 * Each has a comment in the source explaining WHY; these tests are what would fail if
 * that reasoning were violated by a future edit.
 */

const ORG = "org_1";
const PROJECT = "proj_1";

function parse(params: Record<string, string>) {
  const q = listTestCasesSchema.parse(params);
  return buildCaseWhere(ORG, PROJECT, q);
}

describe("buildCaseWhere — scalar filters", () => {
  it("matches an exact case ref", () => {
    const where = parse({ ref: "1042" }) as any;
    expect(where.AND).toContainEqual({ refId: 1042 });
  });

  it("priority multi-select is an ANY (`in`) match, not AND", () => {
    const where = parse({ priority: "HIGH,CRITICAL" }) as any;
    expect(where.AND).toContainEqual({ priority: { in: ["HIGH", "CRITICAL"] } });
  });

  it("title filter is case-insensitive contains", () => {
    const where = parse({ title: "login" }) as any;
    expect(where.AND).toContainEqual({
      title: { contains: "login", mode: "insensitive" },
    });
  });
});

describe("buildCaseWhere — person filters (assignee / createdBy)", () => {
  it("plain ids become an `in` clause", () => {
    const where = parse({ assignee: "u1,u2" }) as any;
    expect(where.AND).toContainEqual({ ownerId: { in: ["u1", "u2"] } });
  });

  it("the unassigned sentinel alone becomes ownerId: null (not an empty `in`)", () => {
    const where = parse({ assignee: UNASSIGNED }) as any;
    // An empty `in: []` matches NOTHING in Prisma — using it here would silently
    // return zero rows instead of every unassigned case.
    expect(where.AND).toContainEqual({ ownerId: null });
    const flat = JSON.stringify(where.AND);
    expect(flat).not.toContain('"in":[]');
  });

  it("ids plus the sentinel become an OR of `in` and null", () => {
    const where = parse({ assignee: `u1,${UNASSIGNED}` }) as any;
    expect(where.AND).toContainEqual({
      OR: [{ ownerId: { in: ["u1"] } }, { ownerId: null }],
    });
  });
});

describe("buildCaseWhere — labels", () => {
  it("matches ANY selected label (owner-confirmed semantics)", () => {
    const where = parse({ label: "tag1,tag2" }) as any;
    expect(where.AND).toContainEqual({
      tags: { some: { tagId: { in: ["tag1", "tag2"] } } },
    });
  });
});

describe("buildCaseWhere — coverage", () => {
  it("yes → issueLinks some", () => {
    const where = parse({ coverage: "yes" }) as any;
    expect(where.AND).toContainEqual({ issueLinks: { some: {} } });
  });

  it("no → issueLinks none", () => {
    const where = parse({ coverage: "no" }) as any;
    expect(where.AND).toContainEqual({ issueLinks: { none: {} } });
  });
});

describe("buildCaseWhere — execution status + test run", () => {
  it("execution status alone filters tests by currentStatusId", () => {
    const where = parse({ execution: "st1" }) as any;
    expect(where.AND).toContainEqual({
      tests: { some: { currentStatusId: { in: ["st1"] }, run: { isDeleted: false } } },
    });
  });

  it("run alone filters tests by runId", () => {
    const where = parse({ run: "run1" }) as any;
    expect(where.AND).toContainEqual({
      tests: { some: { runId: { in: ["run1"] }, run: { isDeleted: false } } },
    });
  });

  it("execution status AND run share ONE `some` clause", () => {
    // Two separate `some` clauses would mean "failed in ANY run, and also
    // separately appears in run R13" — not "failed in run R13", which is what
    // selecting both filters together is supposed to mean.
    const where = parse({ execution: "st1", run: "run1" }) as any;
    const testsClauses = where.AND.filter((c: any) => c.tests);
    expect(testsClauses).toHaveLength(1);
    expect(testsClauses[0]).toEqual({
      tests: {
        some: {
          currentStatusId: { in: ["st1"] },
          runId: { in: ["run1"] },
          run: { isDeleted: false },
        },
      },
    });
  });
});

describe("buildCaseWhere — defects", () => {
  it("yes → some test has some result with a defect link", () => {
    const where = parse({ defect: "yes" }) as any;
    expect(where.AND).toContainEqual({
      tests: { some: { results: { some: { defectLinks: { some: {} } } } } },
    });
  });

  it("no → NO test has a result with a defect link (none at the OUTER level)", () => {
    // `tests: { some: { results: { none: ... } } }` would match a case that has
    // ANY ONE defect-free result — true for nearly every case — instead of a case
    // with no defects anywhere. The outer key must be `none`, not `some`.
    const where = parse({ defect: "no" }) as any;
    expect(where.AND).toContainEqual({
      tests: { none: { results: { some: { defectLinks: { some: {} } } } } },
    });
    const flat = JSON.stringify(where.AND.find((c: any) => c.tests));
    expect(flat).not.toContain('"results":{"none"');
  });
});

describe("buildCaseWhere — date ranges", () => {
  it("createdTo is pushed to the end of that day (23:59:59.999)", () => {
    const where = parse({ createdTo: "2026-08-19" }) as any;
    const clause = where.AND.find((c: any) => c.createdAt);
    const lte: Date = clause.createdAt.lte;
    expect(lte.getUTCHours()).toBe(23);
    expect(lte.getUTCMinutes()).toBe(59);
    expect(lte.getUTCSeconds()).toBe(59);
  });

  it("createdFrom uses the exact UTC midnight, no shift", () => {
    const where = parse({ createdFrom: "2026-08-19" }) as any;
    const clause = where.AND.find((c: any) => c.createdAt);
    const gte: Date = clause.createdAt.gte;
    expect(gte.toISOString()).toBe("2026-08-19T00:00:00.000Z");
  });
});

describe("buildCaseWhere — base scope", () => {
  it("always scopes by org, project, and isDeleted", () => {
    const where = parse({}) as any;
    expect(where.orgId).toBe(ORG);
    expect(where.projectId).toBe(PROJECT);
    expect(where.isDeleted).toBe(false);
  });

  it("no AND key at all when no filters are set", () => {
    const where = parse({}) as any;
    expect(where.AND).toBeUndefined();
  });
});

describe("listTestCasesSchema — CSV parsing", () => {
  it("rejects an unknown enum value rather than silently dropping it", () => {
    // A typo in the URL must not produce an unfiltered list while the chip still
    // claims the filter is applied.
    expect(() => listTestCasesSchema.parse({ priority: "NOT_REAL" })).toThrow();
  });

  it("treats an empty/whitespace param as absent", () => {
    const q = listTestCasesSchema.parse({ priority: "" });
    expect(q.priority).toBeUndefined();
  });

  it("parses TC-1042-style refs via the coercion in the ref filter helper", () => {
    const q = listTestCasesSchema.parse({ ref: "1042" });
    expect(q.ref).toBe(1042);
  });
});
