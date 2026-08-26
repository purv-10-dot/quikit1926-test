/**
 * GET /api/activities — the standalone-record timeline filter.
 *
 * This branch was added so a record whose activities are stored as STANDALONE
 * rows (relatedKind "None", addressed by externalId) can still show a timeline.
 * The Upwork module is its first consumer.
 *
 * `/api/activities` is a SHARED endpoint, so these tests pin two things: the new
 * branch works, and it cannot alter the behaviour of the existing
 * relatedKind/relatedObjectId and leadId paths.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function session(orgId = "t1", role = "Administrator") {
  setSession({ userId: "u1", orgId, role, email: "a@b.co", name: "Alice" });
}

function getReq(url: string) {
  return new Request(url, { method: "GET" }) as unknown as import("next/server").NextRequest;
}

/** Pull the AND fragments out of the where the route handed to Prisma. */
function whereAnd(): Record<string, unknown>[] {
  const where = db.crmActivity.findMany.mock.calls[0]?.[0]?.where as {
    AND?: Record<string, unknown>[];
  };
  return where?.AND ?? [];
}

beforeEach(async () => {
  setSession(null);
  vi.clearAllMocks();
  db.crmActivity.findMany.mockResolvedValue([] as never);
  // The global setup's restoreAllMocks/clearAllMocks strips the account-acl
  // factory mock's resolved value between tests; re-pin it (admin → unrestricted)
  // so buildActivityAclWhere resolves regardless of test order. Same guard as
  // __tests__/api/activities/route.test.ts.
  const acl = await import("@/lib/auth/account-acl");
  (acl.getScope as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
    unrestricted: true,
  });
});

describe("GET /api/activities?sourceSystem&externalIdPrefix", () => {
  it("401s when unauthenticated", async () => {
    const { GET } = await import("@/app/api/activities/route");
    const res = await GET(
      getReq("http://test/api/activities?sourceSystem=upwork-extension&externalIdPrefix=job1:"),
    );
    expect(res.status).toBe(401);
  });

  it("filters by source system and externalId prefix", async () => {
    session("t1");
    const { GET } = await import("@/app/api/activities/route");
    await GET(
      getReq("http://test/api/activities?sourceSystem=upwork-extension&externalIdPrefix=job1:"),
    );

    const match = whereAnd().find((f) => "sourceSystem" in f) as
      | { sourceSystem?: string; externalId?: { startsWith?: string } }
      | undefined;

    expect(match?.sourceSystem).toBe("upwork-extension");
    expect(match?.externalId?.startsWith).toBe("job1:");
  });

  it("stays org-scoped", async () => {
    session("t2");
    const { GET } = await import("@/app/api/activities/route");
    await GET(
      getReq("http://test/api/activities?sourceSystem=upwork-extension&externalIdPrefix=job1:"),
    );
    expect(whereAnd()).toContainEqual({ orgId: "t2" });
  });

  /**
   * Both params are required together. A half-specified request must not widen
   * into "every activity from this source system across the whole org".
   */
  it("ignores sourceSystem when externalIdPrefix is absent", async () => {
    session("t1");
    const { GET } = await import("@/app/api/activities/route");
    await GET(getReq("http://test/api/activities?sourceSystem=upwork-extension"));

    expect(whereAnd().find((f) => "sourceSystem" in f)).toBeUndefined();
  });

  it("ignores externalIdPrefix when sourceSystem is absent", async () => {
    session("t1");
    const { GET } = await import("@/app/api/activities/route");
    await GET(getReq("http://test/api/activities?externalIdPrefix=job1:"));

    expect(whereAnd().find((f) => "externalId" in f)).toBeUndefined();
  });

  /** Regression guard: the pre-existing record-timeline path is untouched. */
  it("still honours relatedKind + relatedObjectId, and does not add the new filter", async () => {
    session("t1");
    const { GET } = await import("@/app/api/activities/route");
    await GET(getReq("http://test/api/activities?relatedKind=Lead&relatedObjectId=lead1"));

    const or = whereAnd().find((f) => "OR" in f) as
      | { OR?: Array<Record<string, unknown>> }
      | undefined;
    expect(or?.OR).toContainEqual({ relatedKind: "Lead", relatedObjectId: "lead1" });
    expect(whereAnd().find((f) => "sourceSystem" in f)).toBeUndefined();
  });

  /** Regression guard: relatedKind/relatedObjectId wins over the new params. */
  it("prefers the relatedKind path when both are supplied", async () => {
    session("t1");
    const { GET } = await import("@/app/api/activities/route");
    await GET(
      getReq(
        "http://test/api/activities?relatedKind=Lead&relatedObjectId=lead1&sourceSystem=upwork-extension&externalIdPrefix=job1:",
      ),
    );
    expect(whereAnd().find((f) => "sourceSystem" in f)).toBeUndefined();
  });
});
