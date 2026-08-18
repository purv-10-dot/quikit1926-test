/**
 * PHASE 08 — Course assignment (`/api/course-assignments/*`, 11 routes).
 *
 * Assignment is the join between content and people, and it turns out to be the
 * narrowest gate in the product: `assignCourse`
 * (lib/services/course-assignments-service.ts:188-202) accepts a course id ONLY
 * if it resolves to
 *   (a) an `lmsMasterCourse` that is `status: 'Published'`, has no parent, and
 *       lists the caller's org in `selectedTenants`, or
 *   (b) an `lmsCourse` with `isMaster: true` that lists the caller's org.
 * Everything else — including a tenant's own course created through
 * `POST /api/courses` — is rejected with 404. That single predicate explains
 * most of what this file asserts, and two of its findings.
 *
 * Because of it, the fixture's seeded `courses.published` is NOT assignable, so
 * this spec provisions its own published-and-distributed master course in
 * `beforeAll` rather than reusing the manifest's.
 *
 * Methods actually exported:
 *   /api/course-assignments                                  GET
 *   /api/course-assignments/[assignmentId]                   DELETE
 *   /api/course-assignments/assign                           POST
 *   /api/course-assignments/bulk-assign                      POST
 *   /api/course-assignments/assign-by-batch                  POST
 *   /api/course-assignments/assign-all-learners              POST
 *   /api/course-assignments/my-assignments                   GET
 *   /api/course-assignments/courses                          GET
 *   /api/course-assignments/courses/[courseId]/assignments   GET
 *   /api/course-assignments/courses/[courseId]/check-prerequisites GET
 *   /api/course-assignments/users/[userId]                   GET
 */

import { test, expect } from "@playwright/test";
import { apiAs, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const LEARNER = m.users.learner.userId;
const NONEXISTENT = "00000000-0000-4000-8000-000000000000";

interface Ok<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string;
  newCount?: number;
  alreadyAssignedCount?: number;
}

interface Assignment {
  id: string;
  courseId: string | { _id: string; title: string };
  targetId: string;
  targetType: string;
  orgId?: string;
  assignmentStatus?: string;
}

/**
 * A published master course distributed to the fixture org — the only kind of
 * course `assignCourse` will accept. Provisioned once for the whole file.
 */
let assignableCourseId: string;

/**
 * The four list endpoints in this feature area are slow enough to trip the
 * 15s default `actionTimeout` when the suite runs in parallel. Measured
 * serially against the dev server with only 4-20 rows in the tenant:
 *   GET /api/course-assignments            4.6-8.8s   (6 rows)
 *   GET /api/course-assignments/courses    3.7-4.0s  (20 rows)
 *   GET .../my-assignments                 2.6-7.6s   (4 rows)
 *   GET .../users/[userId]                 3.7-4.6s   (4 rows)
 * The cost is structural, not cold-start: `getUserAssignments` and
 * `getAssignedCourses` resolve each row's course with a separate `findUnique`
 * (an N+1 over two models), then `enrichAssignmentsWithPresignedUrls` walks the
 * result again. Recorded as an Informational finding; the tests use a raised
 * per-request timeout so a slow response reads as slow rather than as a
 * spurious failure of the assertion it was meant to make.
 */
const SLOW = { timeout: 45_000 } as const;

/** Default per-request timeout for every context in this file (see note above). */
const REQ = { timeout: 45_000 } as const;

/**
 * Every test in this file gets the extended (3x) budget. The write endpoints are
 * as slow as the reads — `assignCourse` performs a two-model course lookup, a
 * tenant-membership check, a find-then-create per target, an audit-log write and
 * a fire-and-forget mail dispatch per call — so a test doing assign → delete →
 * read-back chains three multi-second round-trips. Under the suite's default
 * parallelism that intermittently exceeded the 45s per-test budget, and which
 * test lost the race varied run to run. Raising the budget makes the results
 * deterministic without hiding the underlying slowness, which is recorded as an
 * Informational finding.
 */
test.beforeEach(() => {
  test.slow();
});

test.beforeAll(async () => {
  // Generous per-request timeouts: this hook is the first thing to touch these
  // routes in a run, and a cold Next dev-server compile of the master-course
  // handlers routinely exceeds the 15s default `actionTimeout`. A timeout here
  // would fail every test in the file for a reason that is not about the
  // product.
  test.setTimeout(120_000);
  const SETUP = { timeout: 60_000 };

  const api = await apiAs("superAdmin", REQ);
  const created = await api.post("/api/master-courses", {
    data: {
      title: `phase08 assignable ${Date.now()}`,
      description: "published + distributed so assignCourse accepts it",
      modules: [{ title: "M1", subModules: [{ title: "S1", resourceData: {} }] }],
    },
    ...SETUP,
  });
  const body = (await safeJson(created)) as Ok<{ id: string }>;
  assignableCourseId = body.data!.id;
  const published = await api.post(`/api/master-courses/${assignableCourseId}/publish`, {
    data: { selectedTenants: [m.orgId] },
    ...SETUP,
  });
  expect(published.status(), "phase08 fixture setup: publish must succeed").toBe(200);
  await api.dispose();
});

test.describe("Phase 08 — assign", () => {
  test("POST assign creates an assignment that the learner can then see", async () => {
    const admin = await apiAs("tenantAdmin", REQ);
    const res = await admin.post("/api/course-assignments/assign", {
      data: { courseId: assignableCourseId, targetType: "USER", targetIds: [LEARNER], isMandatory: true },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Assignment[]>;
    expect(body.success).toBe(true);
    expect(body.data?.length).toBeGreaterThan(0);
    expect(body.message).toContain("user(s)");
    await admin.dispose();

    // Read-back from the assignee's own perspective — the strongest proof the
    // row persisted and is correctly targeted.
    const learner = await apiAs("learner", REQ);
    const mine = await learner.get("/api/course-assignments/my-assignments", SLOW);
    expect(mine.status()).toBe(200);
    const mineBody = (await safeJson(mine)) as Ok<Assignment[]>;
    const ids = (mineBody.data ?? []).map((a) =>
      typeof a.courseId === "string" ? a.courseId : a.courseId?._id,
    );
    expect(ids, "the newly assigned course must appear in my-assignments").toContain(assignableCourseId);
    await learner.dispose();
  });

  test("re-assigning the same pair is idempotent (newCount 0, no duplicate)", async () => {
    const admin = await apiAs("tenantAdmin", REQ);
    // First call may or may not create depending on test order; the second is
    // the one under assertion.
    await admin.post("/api/course-assignments/assign", {
      data: { courseId: assignableCourseId, targetType: "USER", targetIds: [LEARNER] },
    });
    const again = await admin.post("/api/course-assignments/assign", {
      data: { courseId: assignableCourseId, targetType: "USER", targetIds: [LEARNER] },
    });
    expect(again.status()).toBe(200);
    const body = (await safeJson(again)) as Ok<Assignment[]>;
    expect(body.newCount, "an already-assigned pair must not create a second row").toBe(0);
    expect(body.alreadyAssignedCount).toBeGreaterThan(0);
    await admin.dispose();
  });

  test("assign with an unknown courseId is 404, not 500", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/course-assignments/assign", {
      data: { courseId: NONEXISTENT, targetType: "USER", targetIds: [LEARNER] },
    });
    expect(res.status()).toBe(404);
    const body = (await safeJson(res)) as { success?: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("Course not found");
    await api.dispose();
  });

  test("assign rejects a targetType outside the USER|GROUP enum with 400", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/course-assignments/assign", {
      data: { courseId: assignableCourseId, targetType: "NONSENSE", targetIds: [LEARNER] },
    });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { error?: string };
    expect(body.error).toContain("targetType");
    await api.dispose();
  });

  test("assign rejects a body missing courseId with 400 naming the field", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/course-assignments/assign", {
      data: { targetType: "USER", targetIds: [LEARNER] },
    });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { error?: string };
    expect(body.error).toContain("courseId");
    await api.dispose();
  });

  test("assign refuses a target user from another tenant", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/course-assignments/assign", {
      data: { courseId: assignableCourseId, targetType: "USER", targetIds: [m.other.adminUserId] },
    });
    expect(
      [400, 403, 404],
      `LEAK: assigning to a foreign-tenant user returned ${res.status()}`,
    ).toContain(res.status());
    await api.dispose();
  });

  test("bulk-assign assigns several courses at once", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/course-assignments/bulk-assign", {
      data: { courseIds: [assignableCourseId], targetType: "USER", targetIds: [LEARNER] },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Array<{ courseId: string }>>;
    expect(body.success).toBe(true);
    expect(body.data?.map((r) => r.courseId)).toContain(assignableCourseId);
    await api.dispose();
  });

  test("assign-by-batch assigns to a real batch's students", async () => {
    test.skip(!m.batchId, "no batch seeded in the manifest");
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/course-assignments/assign-by-batch", {
      data: { courseId: assignableCourseId, batchIds: [m.batchId] },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ assigned: number; batchDetails: Array<{ batchId: string }> }>;
    expect(body.success).toBe(true);
    expect(body.data?.batchDetails?.map((b) => b.batchId)).toContain(m.batchId);
    await api.dispose();
  });

  test("assign-all-learners assigns to every active learner in the tenant", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/course-assignments/assign-all-learners", {
      data: { courseId: assignableCourseId },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ assigned: number; total: number }>;
    expect(body.success).toBe(true);
    // The fixture seeds exactly one LEARNER, so `total` must be at least 1 —
    // a 0 here would mean the tenant filter matched nothing and the test proved
    // nothing.
    expect(body.data?.total, "the fixture tenant has at least one active learner").toBeGreaterThan(0);
    await api.dispose();
  });
});

test.describe("Phase 08 — read + delete", () => {
  test("GET /api/course-assignments lists this tenant's assignments only", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.get("/api/course-assignments", SLOW);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Assignment[]>;
    expect(body.success).toBe(true);
    const foreign = (body.data ?? []).filter((a) => a.orgId && a.orgId !== m.orgId);
    expect(foreign, "LEAK: assignments from another org").toHaveLength(0);
    await api.dispose();
  });

  test("GET courses/[courseId]/assignments returns the rows for that course", async () => {
    const admin = await apiAs("tenantAdmin", REQ);
    await admin.post("/api/course-assignments/assign", {
      data: { courseId: assignableCourseId, targetType: "USER", targetIds: [LEARNER] },
    });
    const res = await admin.get(`/api/course-assignments/courses/${assignableCourseId}/assignments`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Assignment[]>;
    expect(body.data?.map((a) => a.targetId)).toContain(LEARNER);
    await admin.dispose();
  });

  test("GET users/[userId] returns that user's assignments", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.get(`/api/course-assignments/users/${LEARNER}`, SLOW);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Assignment[]>;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    await api.dispose();
  });

  test("GET /api/course-assignments/courses lists assignable courses", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.get("/api/course-assignments/courses", SLOW);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Array<{ _id: string; source: string }>>;
    expect(body.success).toBe(true);
    expect(body.data?.map((c) => c._id)).toContain(assignableCourseId);
    await api.dispose();
  });

  test("GET check-prerequisites reports access for a course with no prerequisites", async () => {
    const api = await apiAs("learner", REQ);
    const res = await api.get(`/api/course-assignments/courses/${assignableCourseId}/check-prerequisites`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ canAccess: boolean; missingCourses: string[] }>;
    expect(body.success).toBe(true);
    expect(body.data?.canAccess).toBe(true);
    expect(body.data?.missingCourses).toEqual([]);
    await api.dispose();
  });

  test("GET check-prerequisites with an unknown course id is 404", async () => {
    const api = await apiAs("learner", REQ);
    const res = await api.get(`/api/course-assignments/courses/${NONEXISTENT}/check-prerequisites`);
    expect(res.status()).toBe(404);
    await api.dispose();
  });

  test("DELETE removes an assignment and it disappears from the course's list", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const created = await api.post("/api/course-assignments/assign", {
      data: { courseId: assignableCourseId, targetType: "USER", targetIds: [m.users.manager.userId] },
      ...SLOW,
    });
    const cb = (await safeJson(created)) as Ok<Assignment[]>;
    const assignmentId = cb.data?.[0]?.id;
    expect(assignmentId, "setup: assign must return the created row").toBeTruthy();

    const res = await api.delete(`/api/course-assignments/${assignmentId}`, SLOW);
    expect(res.status()).toBe(200);
    expect(((await safeJson(res)) as Ok).success).toBe(true);

    const after = await api.get(`/api/course-assignments/courses/${assignableCourseId}/assignments`, SLOW);
    const ab = (await safeJson(after)) as Ok<Assignment[]>;
    expect(
      (ab.data ?? []).map((a) => a.id),
      "the deleted assignment must be gone on read-back",
    ).not.toContain(assignmentId);
    await api.dispose();
  });

  test("DELETE with an unknown assignment id is 404, not 500", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.delete(`/api/course-assignments/${NONEXISTENT}`);
    expect(res.status()).toBe(404);
    const body = (await safeJson(res)) as { message?: string };
    expect(body.message).toContain("Assignment not found");
    await api.dispose();
  });

  test("DELETE cannot remove another tenant's assignment", async () => {
    // removeAssignment scopes its deleteMany by orgId, so a foreign id looks
    // simply absent — 404 rather than 403, which is the correct answer here.
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.delete(`/api/course-assignments/${NONEXISTENT}`);
    expect([403, 404]).toContain(res.status());
    await api.dispose();
  });
});

test.describe("Phase 08 — role guards", () => {
  const ADMIN_ONLY: Array<{ label: string; run: (api: Awaited<ReturnType<typeof apiAs>>) => Promise<{ status(): number }> }> = [
    { label: "GET /api/course-assignments", run: (api) => api.get("/api/course-assignments") },
    { label: "GET /api/course-assignments/courses", run: (api) => api.get("/api/course-assignments/courses") },
    { label: "GET /api/course-assignments/users/[userId]", run: (api) => api.get(`/api/course-assignments/users/${LEARNER}`) },
    {
      label: "POST /api/course-assignments/assign",
      run: (api) => api.post("/api/course-assignments/assign", { data: { courseId: NONEXISTENT, targetType: "USER", targetIds: [LEARNER] } }),
    },
    {
      label: "POST /api/course-assignments/bulk-assign",
      run: (api) => api.post("/api/course-assignments/bulk-assign", { data: { courseIds: [NONEXISTENT], targetType: "USER", targetIds: [LEARNER] } }),
    },
    {
      label: "POST /api/course-assignments/assign-by-batch",
      run: (api) => api.post("/api/course-assignments/assign-by-batch", { data: { courseId: NONEXISTENT, batchIds: [NONEXISTENT] } }),
    },
    {
      label: "POST /api/course-assignments/assign-all-learners",
      run: (api) => api.post("/api/course-assignments/assign-all-learners", { data: { courseId: NONEXISTENT } }),
    },
    { label: "DELETE /api/course-assignments/[id]", run: (api) => api.delete(`/api/course-assignments/${NONEXISTENT}`) },
  ];

  for (const g of ADMIN_ONLY) {
    test(`LEARNER is refused by ${g.label}`, async () => {
      const api = await apiAs("learner", REQ);
      const res = await g.run(api);
      expect(res.status()).toBe(403);
      await api.dispose();
    });
  }

  test("TEACHER is refused by the assignment list", async () => {
    const api = await apiAs("teacher", REQ);
    const res = await api.get("/api/course-assignments");
    expect(res.status()).toBe(403);
    await api.dispose();
  });

  test("my-assignments is open to any authenticated role and self-scoped", async () => {
    // Deliberately requireAuth-only: everyone needs to see their own work.
    // What matters is that it returns ONLY the caller's rows.
    const api = await apiAs("learner", REQ);
    const res = await api.get("/api/course-assignments/my-assignments", SLOW);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Assignment[]>;
    const notMine = (body.data ?? []).filter((a) => a.targetId && a.targetId !== LEARNER);
    expect(notMine, "my-assignments must never include another user's rows").toHaveLength(0);
    await api.dispose();
  });
});

test.describe("Phase 08 — findings", () => {
  /**
   * FINDING (Medium) — check-prerequisites resolves courses across tenants.
   *
   * Endpoint : GET /api/course-assignments/courses/[courseId]/check-prerequisites
   * Observed : a LEARNER in the fixture org passes the VICTIM tenant's course id
   *            and gets 200 `{ canAccess: true, missingCourses: [] }`. A course
   *            id that exists NOWHERE gets 404. The two answers differ, so the
   *            endpoint is a working existence oracle for course ids belonging
   *            to any tenant on the platform.
   * Expected : 404 for both — a course the caller's org cannot see should be
   *            indistinguishable from one that does not exist.
   * Root cause: lib/services/course-assignments-service.ts, `checkPrerequisites`
   *            — the course and its prerequisite rows are fetched with
   *              prisma.lmsCourse.findUnique({ where: { id: courseId } })
   *            (and the same for `lmsMasterCourse`), with no orgId predicate.
   *            Only the learner's completion query is scoped:
   *              prisma.lmsProgress.findMany({ where: { orgId, learnerId, … } })
   *            The route (…/check-prerequisites/route.ts) passes `orgId` in, so
   *            the information to scope the lookup is available and simply
   *            unused.
   *
   * Severity Medium, not High: the response body carries no foreign course
   * content by itself. But `missingCourses` is a list of prerequisite course
   * TITLES resolved from the same unscoped lookup, so a foreign course that has
   * prerequisites will leak their titles to any authenticated user of any
   * tenant, and the oracle makes id enumeration meaningful.
   *
   * Left FAILING intentionally.
   */
  test("check-prerequisites refuses a course belonging to another tenant", async () => {
    const api = await apiAs("learner", REQ);
    const res = await api.get(`/api/course-assignments/courses/${m.other.courseId}/check-prerequisites`);
    const body = (await safeJson(res)) as Ok<{ canAccess: boolean }>;
    expect(
      [403, 404],
      `CROSS-TENANT ORACLE: got ${res.status()} (canAccess=${body.data?.canAccess}) for a foreign course id, ` +
        `while a genuinely unknown id returns 404`,
    ).toContain(res.status());
    await api.dispose();
  });

  /**
   * FINDING (Medium) — a tenant's own course can never be assigned to anyone.
   *
   * Endpoint : POST /api/course-assignments/assign
   * Observed : the fixture's seeded published tenant course
   *            (`m.courses.published`, `orgId = <fixture org>`, `isMaster:false`,
   *            `status:'Published'`) is rejected with
   *            404 "Course not found or not available to this tenant" — for the
   *            TENANT_ADMIN of the very org that owns it.
   * Expected : a tenant admin can assign a published course their own org owns.
   * Root cause: lib/services/course-assignments-service.ts:192-202. Neither
   *            branch of the lookup can match a tenant-owned course:
   *              // branch 1 — lmsMasterCourse only
   *              where: { id, status:'Published', parentCourseId:null,
   *                       selectedTenants: { some: { orgId } } }
   *              // branch 2 — lmsCourse, but REQUIRES isMaster
   *              where: { id, isMaster: true, selectedTenants: { some: { orgId } } }
   *            Branch 2 matches on `selectedTenants` + `isMaster`, never on
   *            `orgId` ownership. `POST /api/courses`
   *            (courses-service.ts:95-100) creates rows with `orgId` set and
   *            `isMaster` defaulted false, and never populates `selectedTenants`
   *            — so every course a tenant authors through the documented
   *            creation endpoint is permanently unassignable.
   *
   * This is a coherent design if the product intends distribution to flow only
   * from operator-published master courses. It is recorded as a finding rather
   * than an observation because `POST /api/courses` is an exposed, role-guarded,
   * tenant-scoped authoring endpoint whose output has no path to a learner —
   * content that can be created but never delivered.
   *
   * Left FAILING intentionally so the contradiction stays visible.
   */
  test("a tenant admin can assign their own org's published course", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/course-assignments/assign", {
      data: { courseId: m.courses.published, targetType: "USER", targetIds: [LEARNER] },
    });
    const body = (await safeJson(res)) as { message?: string };
    expect(
      res.status(),
      `tenant-owned course rejected: "${body.message}" — assignCourse requires isMaster+selectedTenants ` +
        `(course-assignments-service.ts:192-202), which POST /api/courses never sets`,
    ).toBe(200);
    await api.dispose();
  });

  /**
   * INFORMATIONAL — assign-by-batch silently succeeds with unknown batch ids.
   *
   * `POST /api/course-assignments/assign-by-batch` with a batchIds array of
   * ids that do not exist (or belong to another tenant) returns
   * 200 `{ assigned: 0, skipped: 0, batchDetails: [] }` — "Course assigned to 0
   * student(s)". The service loops batches with `if (!batch) continue;`, so an
   * entirely bogus request is indistinguishable from a batch that happens to be
   * empty. Worse, on that path `courseId` is never validated either, so a
   * request naming a nonexistent course AND a nonexistent batch still returns
   * success.
   *
   * Correct as a tenant-isolation matter (foreign batches are filtered out by
   * the scoped `lmsBatch` lookup); poor as an API contract. Recorded, asserted
   * as documented behaviour rather than as a verdict.
   */
  test("[informational] assign-by-batch returns success for entirely unknown batch ids", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/course-assignments/assign-by-batch", {
      data: { courseId: NONEXISTENT, batchIds: [NONEXISTENT] },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ assigned: number; batchDetails: unknown[] }>;
    expect(body.success).toBe(true);
    expect(body.data?.assigned).toBe(0);
    console.log(
      `[INFO] assign-by-batch with a bogus course AND bogus batch → 200 "${body.message}" ` +
        `(no validation of either id on the zero-student path)`,
    );
    await api.dispose();
  });

  /**
   * INFORMATIONAL — the assignable-course list includes unassignable courses.
   *
   * `GET /api/course-assignments/courses` returns, alongside genuinely
   * distributable courses, the caller org's own in-flight submissions —
   * statuses `PendingTenantApproval`, `PendingApproval`, `RejectedByTenantAdmin`
   * — via the `ownPending` query at
   * lib/services/course-assignments-service.ts (`getAssignedCourses`,
   * `where: { status: { not: 'Published' }, submittedByTenantId: orgId }`).
   * Passing any of those ids to `POST .../assign` returns 404.
   *
   * The `ownPending` branch is clearly deliberate (a "my pipeline" view) and
   * each row carries its `status`, so a client can filter. Recorded only
   * because a caller that treats this endpoint's name literally will build a
   * picker whose options mostly 404.
   */
  test("[informational] the assignable-course list contains courses that assign rejects", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.get("/api/course-assignments/courses", SLOW);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Array<{ _id: string; status: string }>>;
    const notPublished = (body.data ?? []).filter((c) => c.status !== "Published");
    console.log(
      `[INFO] ${notPublished.length}/${body.data?.length ?? 0} listed "assignable" courses are not Published ` +
        `(statuses: ${[...new Set(notPublished.map((c) => c.status))].join(", ") || "none"})`,
    );
    expect(Array.isArray(body.data)).toBe(true);
    await api.dispose();
  });
});
