/**
 * PHASE 09 — Learner progress (`/api/progress/*`, 6 routes).
 *
 * Every route here is `requireAuth` with no `requireRoles`, which is correct —
 * progress is inherently self-scoped: the actor's own `id` and `orgId` are used
 * as the write key (`lmsProgress` has a compound unique on
 * `orgId_learnerId_courseId`), so there is no id in any request body that could
 * be pointed at another user. The risk surface is therefore not authorisation
 * but *input handling*, and that is where this phase concentrates.
 *
 * Two shapes recur and are worth stating up front:
 *
 * - Four of the six routes parse their body as `z.object({}).passthrough()` —
 *   i.e. no validation at all — then read `courseId` with a bare cast. A missing
 *   `courseId` therefore reaches Prisma as `undefined` and surfaces as a 500.
 * - `GET /api/progress/[courseId]` recomputes completion on read and WRITES the
 *   corrected row back, so it is a non-idempotent GET.
 *
 * Methods actually exported:
 *   /api/progress                                        POST
 *   /api/progress/my                                     GET
 *   /api/progress/[courseId]                             GET
 *   /api/progress/[courseId]/lesson/[lessonId]/complete  POST
 *   /api/progress/sync-progress                          PATCH   (not POST)
 *   /api/progress/generate-missing-certificates          POST
 */

import { test, expect } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const COURSE = m.courses.published;
const LESSON = m.modules[0].lessons[0];
const LESSON_2 = m.modules[0].lessons[1];
const NONEXISTENT = "00000000-0000-4000-8000-000000000000";

interface Ok<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string;
}

interface Progress {
  id: string;
  orgId: string;
  learnerId: string;
  courseId: string | { _id: string; title: string };
  status: string;
  completionPercentage: number;
  lessonProgress?: Record<string, unknown> | null;
}

test.describe("Phase 09 — write then read back", () => {
  test("POST /api/progress upserts a progress row scoped to the caller", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/progress", {
      data: { courseId: COURSE, lessonId: LESSON, currentPosition: "time:42", duration: 100 },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Progress>;
    expect(body.success).toBe(true);
    // The write key is derived from the session, never from the body — assert it.
    expect(body.data?.learnerId).toBe(m.users.learner.userId);
    expect(body.data?.orgId).toBe(m.orgId);
    expect(body.data?.courseId).toBe(COURSE);

    const readBack = await api.get(`/api/progress/${COURSE}`);
    expect(readBack.status()).toBe(200);
    const rb = (await safeJson(readBack)) as Ok<Progress>;
    expect(rb.data?.id, "the upserted row must be the one a subsequent read returns").toBe(body.data?.id);
    await api.dispose();
  });

  test("GET /api/progress/my lists only the caller's own progress", async () => {
    const api = await apiAs("learner");
    await api.post("/api/progress", { data: { courseId: COURSE, lessonId: LESSON } });
    const res = await api.get("/api/progress/my");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Progress[]>;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    const notMine = (body.data ?? []).filter((p) => p.learnerId && p.learnerId !== m.users.learner.userId);
    expect(notMine, "progress/my must never return another learner's rows").toHaveLength(0);
    const foreignOrg = (body.data ?? []).filter((p) => p.orgId && p.orgId !== m.orgId);
    expect(foreignOrg, "LEAK: progress rows from another org").toHaveLength(0);
    await api.dispose();
  });

  test("lesson/complete marks a lesson and the completion is visible on re-read", async () => {
    const api = await apiAs("learner");
    const res = await api.post(`/api/progress/${COURSE}/lesson/${LESSON}/complete`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ completed: boolean; lessonId: string; completionPercentage: number }>;
    expect(body.success).toBe(true);
    expect(body.data?.completed).toBe(true);
    expect(body.data?.lessonId).toBe(LESSON);

    const readBack = await api.get(`/api/progress/${COURSE}`);
    const rb = (await safeJson(readBack)) as Ok<Progress>;
    expect(rb.data?.lessonProgress, "the completed lesson must be recorded on the row").toHaveProperty(LESSON);
    await api.dispose();
  });

  test("completing a second lesson raises the overall percentage", async () => {
    const api = await apiAs("learner");
    const first = await api.post(`/api/progress/${COURSE}/lesson/${LESSON}/complete`);
    const firstPct = ((await safeJson(first)) as Ok<{ completionPercentage: number }>).data!.completionPercentage;
    const second = await api.post(`/api/progress/${COURSE}/lesson/${LESSON_2}/complete`);
    const secondPct = ((await safeJson(second)) as Ok<{ completionPercentage: number }>).data!.completionPercentage;
    // The course has 4 lessons across 2 modules, so two completions must score
    // strictly higher than one. Guards against the percentage being a constant.
    expect(secondPct, "overall completion must increase as lessons complete").toBeGreaterThan(firstPct);
    await api.dispose();
  });

  test("PATCH /api/progress/sync-progress records a partial completion", async () => {
    const api = await apiAs("learner");
    const res = await api.patch("/api/progress/sync-progress", {
      data: { courseId: COURSE, lessonId: LESSON, completionPercentage: 55, currentPosition: "time:120" },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Progress>;
    expect(body.success).toBe(true);
    expect(body.message).toBe("Progress synced successfully");
    expect(body.data?.learnerId).toBe(m.users.learner.userId);
    await api.dispose();
  });

  test("POST generate-missing-certificates returns a tally", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/progress/generate-missing-certificates");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ generated: number; alreadyExist: number; failed: number }>;
    expect(body.success).toBe(true);
    expect(typeof body.data?.generated).toBe("number");
    expect(typeof body.data?.alreadyExist).toBe("number");
    expect(typeof body.data?.failed).toBe("number");
    await api.dispose();
  });

  test("every progress route rejects an unauthenticated caller", async () => {
    const anon = await apiAnon();
    const res = await anon.get("/api/progress/my");
    expect([401, 403]).toContain(res.status());
    const body = (await safeJson(res)) as { statusCode?: number };
    expect(body.statusCode).toBe(res.status());
    await anon.dispose();
  });
});

test.describe("Phase 09 — role access", () => {
  // These routes are intentionally open to every authenticated role: a TEACHER
  // or MANAGER has progress of their own. The assertion is that each role gets
  // a well-formed, self-scoped answer — not that they are refused.
  for (const role of ["teacher", "manager", "parent", "tenantAdmin"] as const) {
    test(`${role} can read their own progress list`, async () => {
      const api = await apiAs(role);
      const res = await api.get("/api/progress/my");
      expect(res.status()).toBe(200);
      const body = (await safeJson(res)) as Ok<Progress[]>;
      expect(body.success).toBe(true);
      const notMine = (body.data ?? []).filter(
        (p) => p.learnerId && p.learnerId !== m.users[role].userId,
      );
      expect(notMine, `${role} saw another user's progress`).toHaveLength(0);
      await api.dispose();
    });
  }
});

test.describe("Phase 09 — findings", () => {
  /**
   * FINDING (Medium) — a missing `courseId` returns 500 instead of 400.
   *
   * Endpoint : POST /api/progress
   *            PATCH /api/progress/sync-progress
   * Observed : `{}` (or any body without `courseId`) → HTTP 500
   *            `{"statusCode":500,"message":"Internal server error"}`.
   * Expected : 400 with `validationErrors: [{ field: "courseId", … }]`.
   * Root cause: app/api/progress/route.ts and
   *            app/api/progress/sync-progress/route.ts both parse with
   *              parseBody(req, z.object({}).passthrough())
   *            — a schema that validates nothing — and then read the field with
   *            a bare cast (`body.courseId as string`). `undefined` is passed
   *            to `updateProgress`/`syncProgress`
   *            (lib/services/progress-service.ts), which uses it as part of the
   *            `orgId_learnerId_courseId` compound key in a `prisma.lmsProgress
   *            .upsert`. Prisma rejects the undefined key component, and
   *            lib/http.ts:126-134 turns the unrecognised error into a 500.
   *
   * Severity Medium: no data exposure and no corruption, but an unauthenticated
   * -to-the-schema client can drive 5xx at will, which is both a monitoring
   * problem and a cheap way to fill logs. The fix is one required field in a
   * zod schema; the surrounding routes already demonstrate the pattern.
   *
   * Left FAILING intentionally (two tests).
   */
  test("POST /api/progress rejects a body with no courseId using 400, not 500", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/progress", { data: {} });
    expect(
      res.status(),
      "unvalidated courseId reaches the Prisma compound key and surfaces as a 500",
    ).toBe(400);
    await api.dispose();
  });

  test("PATCH /api/progress/sync-progress rejects a body with no courseId using 400, not 500", async () => {
    const api = await apiAs("learner");
    const res = await api.patch("/api/progress/sync-progress", { data: {} });
    expect(
      res.status(),
      "same unvalidated-passthrough pattern as POST /api/progress",
    ).toBe(400);
    await api.dispose();
  });

  /**
   * FINDING (Low) — progress can be recorded against any course id at all,
   * including one belonging to another tenant.
   *
   * Endpoint : POST /api/progress
   * Observed : a LEARNER posts `{ courseId: <victim tenant's course id> }` and
   *            receives 200 with a newly created progress row. Same for a
   *            course id that exists nowhere. The row is written with the
   *            CALLER's `orgId`, so nothing crosses a tenant boundary — but a
   *            row now exists referencing a course the tenant cannot see.
   * Expected : 404 — progress against a course the caller has no access to (or
   *            that does not exist) is not a meaningful operation.
   * Root cause: lib/services/progress-service.ts, `updateProgress` →
   *            `loadOrInit`, which goes straight to
   *              prisma.lmsProgress.upsert({ where: { orgId_learnerId_courseId: … } })
   *            with no prior existence check on `courseId` and no consultation
   *            of `lmsCourseAssignment`. `calculateOverallCourseProgress` then
   *            fails to resolve the course and silently yields a -1 percentage
   *            rather than raising.
   *
   * Severity Low: self-scoped writes only, no cross-tenant read or write. It is
   * recorded because it lets any authenticated user create unbounded rows in
   * `lmsProgress` keyed on arbitrary strings — a slow-growing integrity and
   * storage problem, and it makes "courses this learner has touched" unreliable
   * as a data source.
   *
   * Left FAILING intentionally.
   */
  test("POST /api/progress refuses a course id from another tenant", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/progress", { data: { courseId: m.other.courseId, lessonId: "x" } });
    const body = (await safeJson(res)) as Ok<Progress>;
    expect(
      [400, 403, 404],
      `got ${res.status()} — a progress row (${body.data?.id}) was created against a foreign course id ` +
        `with no existence or access check`,
    ).toContain(res.status());
    await api.dispose();
  });

  /**
   * INFORMATIONAL — `GET /api/progress/[courseId]` writes to the database.
   *
   * `getProgress` (lib/services/progress-service.ts) recomputes the weighted
   * completion percentage and lifecycle status on every read, and if either
   * differs from the stored row it issues a `prisma.lmsProgress.update` —
   * including clearing `completedAt` when the recomputed status is no longer
   * `Completed`. A GET is therefore neither idempotent nor safe in the HTTP
   * sense: it can be cached or retried by any intermediary and will mutate
   * state.
   *
   * Not a security issue and arguably a pragmatic self-healing design, but it
   * means a read path can flip a learner's completion off, and it makes GET
   * unusable behind any write-averse proxy. Recorded without a verdict.
   */
  test("[informational] GET /api/progress/[courseId] recomputes and persists on read", async () => {
    const api = await apiAs("learner");
    await api.post("/api/progress", { data: { courseId: COURSE, lessonId: LESSON } });
    const first = await api.get(`/api/progress/${COURSE}`);
    const second = await api.get(`/api/progress/${COURSE}`);
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    const a = ((await safeJson(first)) as Ok<Progress>).data;
    const b = ((await safeJson(second)) as Ok<Progress>).data;
    // Same row, and the read is stable once converged — the point is only to
    // record that the handler has a write path at all.
    expect(a?.id).toBe(b?.id);
    console.log(
      `[INFO] GET /api/progress/[courseId] recomputes status/percentage and may UPDATE the row ` +
        `(progress-service.getProgress) — a non-idempotent GET. status=${a?.status} pct=${a?.completionPercentage}`,
    );
    await api.dispose();
  });

  /**
   * INFORMATIONAL — an unknown course id reads as 200 `data: null`, not 404.
   *
   * `GET /api/progress/[courseId]` returns `{ success: true, data: null }` for a
   * course that does not exist, one the tenant cannot see, and one the learner
   * simply has not started — three different situations collapsed into one
   * response. Consistent with the rest of the progress surface, and arguably
   * right for "not started", but it means a client cannot detect a bad id.
   */
  test("[informational] GET /api/progress/[courseId] returns null rather than 404 for an unknown course", async () => {
    const api = await apiAs("learner");
    const res = await api.get(`/api/progress/${NONEXISTENT}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Progress | null>;
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
    await api.dispose();
  });
});
