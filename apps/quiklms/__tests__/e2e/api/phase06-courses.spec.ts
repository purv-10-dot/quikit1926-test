/**
 * PHASE 06 — Course CRUD surface (`/api/courses/*`).
 *
 * Eight endpoints, and the interesting thing about them is how unevenly they are
 * guarded. Three of them (`POST /api/courses`, `/courses/lessons`,
 * `/courses/modules`) carry an explicit
 * `requireRoles(actor, ['ADMIN','TENANT_ADMIN','SUB_ADMIN'])`. The other
 * five call `requireAuth` and stop there — which for the two `order` endpoints
 * means any authenticated LEARNER can rewrite a course's structure, and for
 * `player-data` means a hand-written Prisma query with no tenant filter at all.
 *
 * Methods actually exported (checked against source before writing a single
 * probe, per CONVENTIONS rule 2):
 *   /api/courses                                  GET, POST
 *   /api/courses/[id]                             GET only
 *   /api/courses/[id]/player-data                 GET only
 *   /api/courses/enrolled                         GET only
 *   /api/courses/lessons                          POST only
 *   /api/courses/modules                          POST only
 *   /api/courses/[id]/modules/order               PUT only
 *   /api/courses/modules/[moduleId]/lessons/order PUT only
 * Probing anything else returns a meaningless 405.
 */

import { test, expect } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const PUBLISHED = m.courses.published;
const DRAFT = m.courses.draft;
const MODULE_IDS = m.modules.map((mod) => mod.id);
const MODULE_0 = m.modules[0].id;
const NONEXISTENT = "00000000-0000-4000-8000-000000000000";

/**
 * Default per-request timeout for every context in this file, overriding the
 * config's 15s `actionTimeout`. `GET /api/courses` runs `findAllForTenant`
 * across two models and then `enrichCoursesWithPresignedUrls` over every row, so
 * its latency grows with the tenant's course count and exceeded the default once
 * the suite had created a few dozen courses. A slow-but-correct list response
 * should read as slow, not as a failure of the assertion under test.
 */
const REQ = { timeout: 45_000 } as const;

interface Ok<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string;
}

test.describe("Phase 06 — reads", () => {
  test("GET /api/courses returns the success envelope for an admin", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.get("/api/courses");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Array<{ id: string; title: string }>>;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // The seeded published course must be in there — proves we're reading the
    // fixture tenant and not an empty result that would make every other
    // assertion in this file vacuous.
    expect(body.data!.map((c) => c.id)).toContain(PUBLISHED);
    await api.dispose();
  });

  test("GET /api/courses/[id] returns the seeded published course with its modules", async () => {
    const api = await apiAs("teacher", REQ);
    const res = await api.get(`/api/courses/${PUBLISHED}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ id: string; title: string; modules: unknown[] }>;
    expect(body.success).toBe(true);
    expect(body.data?.id).toBe(PUBLISHED);
    expect(body.data?.modules?.length).toBeGreaterThan(0);
    await api.dispose();
  });

  test("GET /api/courses/[id] with an unknown id is 404, not 500", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.get(`/api/courses/${NONEXISTENT}`);
    expect(res.status()).toBe(404);
    const body = (await safeJson(res)) as { success?: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("not found");
    await api.dispose();
  });

  test("GET /api/courses/enrolled returns an envelope for a learner", async () => {
    const api = await apiAs("learner", REQ);
    const res = await api.get("/api/courses/enrolled");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<unknown[]>;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    await api.dispose();
  });

  test("GET /api/courses/[id]/player-data returns structured module/lesson data", async () => {
    const api = await apiAs("learner", REQ);
    const res = await api.get(`/api/courses/${PUBLISHED}/player-data`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{
      course: { id: string } | null;
      modules: Array<{ id: string; lessons: unknown[] }>;
      totalLessons: number;
    }>;
    expect(body.success).toBe(true);
    expect(body.data?.course?.id).toBe(PUBLISHED);
    expect(body.data?.modules?.length).toBe(MODULE_IDS.length);
    expect(body.data?.totalLessons).toBeGreaterThan(0);
    await api.dispose();
  });

  test("anonymous access to /api/courses is rejected", async () => {
    const anon = await apiAnon();
    const res = await anon.get("/api/courses");
    expect([401, 403]).toContain(res.status());
    await anon.dispose();
  });
});

test.describe("Phase 06 — role guards", () => {
  // The three routes that DO carry requireRoles. LEARNER must bounce off all of
  // them with a 403 carrying the standard error envelope.
  const GUARDED: Array<{ label: string; run: (api: Awaited<ReturnType<typeof apiAs>>) => Promise<{ status(): number }> }> = [
    {
      label: "POST /api/courses",
      run: (api) => api.post("/api/courses", { data: { title: "phase06 forbidden" } }),
    },
    {
      label: "POST /api/courses/modules",
      run: (api) => api.post("/api/courses/modules", { data: { courseId: PUBLISHED, title: "phase06 forbidden" } }),
    },
    {
      label: "POST /api/courses/lessons",
      run: (api) => api.post("/api/courses/lessons", { data: { moduleId: MODULE_0, title: "phase06 forbidden", type: "VIDEO" } }),
    },
  ];

  for (const g of GUARDED) {
    test(`LEARNER is refused by ${g.label}`, async () => {
      const api = await apiAs("learner", REQ);
      const res = await g.run(api);
      expect(res.status()).toBe(403);
      await api.dispose();
    });
  }

  test("TEACHER is refused by POST /api/courses/modules (author roles only)", async () => {
    const api = await apiAs("teacher", REQ);
    const res = await api.post("/api/courses/modules", { data: { courseId: PUBLISHED, title: "phase06 teacher" } });
    expect(res.status()).toBe(403);
    const body = (await safeJson(res)) as { message?: string };
    expect(body.message).toContain("Current role: TEACHER");
    await api.dispose();
  });
});

test.describe("Phase 06 — mutations persist", () => {
  test("POST /api/courses creates a course that can be read back", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const title = `phase06 created ${Date.now()}`;
    const created = await api.post("/api/courses", {
      data: { title, description: "created by phase06", category: "E2E", status: "Draft" },
    });
    // NOTE: this asserts 200-or-201 deliberately. The route returns 200, while
    // the repo standard (CLAUDE.md, "API Route Pattern") says "POST returns 201
    // on creation" — recorded as an Informational finding rather than failed
    // here, since the envelope and the persisted row are both correct.
    expect([200, 201]).toContain(created.status());
    const body = (await safeJson(created)) as Ok<{ id: string; title: string }>;
    expect(body.success).toBe(true);
    const newId = body.data?.id;
    expect(newId, "create must return the new course id").toBeTruthy();

    // Read-back: prove it actually persisted rather than being echoed.
    const readBack = await api.get(`/api/courses/${newId}`);
    expect(readBack.status()).toBe(200);
    const rb = (await safeJson(readBack)) as Ok<{ id: string; title: string; orgId: string }>;
    expect(rb.data?.title).toBe(title);
    expect(rb.data?.orgId, "created course must be scoped to the actor's org").toBe(m.orgId);
    await api.dispose();
  });

  test("POST /api/courses/modules adds a module that appears on the course", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const title = `phase06 module ${Date.now()}`;
    const res = await api.post("/api/courses/modules", { data: { courseId: DRAFT, title } });
    expect([200, 201]).toContain(res.status());
    const body = (await safeJson(res)) as Ok<{ id: string; title: string; courseId: string }>;
    expect(body.success).toBe(true);
    expect(body.data?.courseId).toBe(DRAFT);

    const readBack = await api.get(`/api/courses/${DRAFT}`);
    const rb = (await safeJson(readBack)) as Ok<{ modules: Array<{ id: string; title: string }> }>;
    expect(
      rb.data?.modules?.map((mod) => mod.title),
      "the new module must be visible on a subsequent read",
    ).toContain(title);
    await api.dispose();
  });

  test("POST /api/courses/lessons adds a lesson that appears on the module", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    // Create a throwaway module so we never mutate the seeded lesson set that
    // the ordering tests below depend on.
    const modRes = await api.post("/api/courses/modules", {
      data: { courseId: DRAFT, title: `phase06 lesson-host ${Date.now()}` },
    });
    const modBody = (await safeJson(modRes)) as Ok<{ id: string }>;
    const moduleId = modBody.data!.id;

    const lessonTitle = `phase06 lesson ${Date.now()}`;
    const res = await api.post("/api/courses/lessons", {
      // `type` must be a LmsLessonType member — the enum is PascalCase
      // ("Video", not "VIDEO"); see the finding below for what a wrong value does.
      data: { moduleId, title: lessonTitle, type: "Video", contentUrl: "https://example.test/v.mp4" },
    });
    expect([200, 201]).toContain(res.status());
    const body = (await safeJson(res)) as Ok<{ id: string; lessons: Array<{ title: string }> }>;
    expect(body.success).toBe(true);
    // addLesson returns the parent module re-read with its lessons — the
    // read-back is built into the response.
    expect(body.data?.lessons?.map((l) => l.title)).toContain(lessonTitle);
    await api.dispose();
  });

  test("POST /api/courses/lessons with an unknown moduleId is 404, not 500", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/courses/lessons", {
      data: { moduleId: NONEXISTENT, title: "orphan", type: "Video" },
    });
    expect(res.status()).toBe(404);
    await api.dispose();
  });

  test("POST /api/courses/modules rejects a body missing courseId with 400 naming the field", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/courses/modules", { data: { title: "no course id" } });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { error?: string };
    expect(body.error).toContain("courseId");
    await api.dispose();
  });

  test("PUT /api/courses/[id]/modules/order reorders and the new order persists", async () => {
    const admin = await apiAs("tenantAdmin", REQ);
    const reversed = [...MODULE_IDS].reverse();
    const res = await admin.put(`/api/courses/${PUBLISHED}/modules/order`, { data: { moduleIds: reversed } });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok;
    expect(body.success).toBe(true);

    const readBack = await admin.get(`/api/courses/${PUBLISHED}`);
    const rb = (await safeJson(readBack)) as Ok<{ modules: Array<{ id: string; orderIndex: number }> }>;
    const order = [...rb.data!.modules].sort((a, b) => a.orderIndex - b.orderIndex).map((mod) => mod.id);
    expect(order, "module order must reflect the PUT").toEqual(reversed);

    // Restore so re-runs and sibling specs see the seeded order.
    await admin.put(`/api/courses/${PUBLISHED}/modules/order`, { data: { moduleIds: MODULE_IDS } });
    await admin.dispose();
  });

  test("PUT /api/courses/[id]/modules/order with an unknown course id is 404", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.put(`/api/courses/${NONEXISTENT}/modules/order`, { data: { moduleIds: [] } });
    expect(res.status()).toBe(404);
    await api.dispose();
  });

  test("PUT /api/courses/modules/[moduleId]/lessons/order with an unknown module id is 404", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.put(`/api/courses/modules/${NONEXISTENT}/lessons/order`, { data: { lessonIndices: [] } });
    expect(res.status()).toBe(404);
    await api.dispose();
  });
});

test.describe("Phase 06 — findings", () => {
  /**
   * FINDING (Medium) — Draft courses are served to LEARNERs.
   *
   * Endpoint : GET /api/courses
   * Observed : the seeded Draft course (m.courses.draft) is present in the list
   *            for a LEARNER session, with `status: "Draft"`.
   * Expected : unpublished authoring work-in-progress should not be readable by
   *            the audience it has not been published to.
   * Root cause: lib/services/courses-service.ts:106-116 — `findAllForTenant`
   *            filters `lmsCourse` on tenancy ONLY:
   *              where: { OR: [ { orgId }, { isMaster: true, selectedTenants: … } ] }
   *            There is no `status` predicate and no actor role parameter — the
   *            function does not receive the caller's role at all, so it cannot
   *            filter by it. Note the deliberate contrast three lines below at
   *            :118-125, where the MASTER course branch DOES filter
   *            `status: 'Published'`. The relational branch was simply never
   *            given the same treatment.
   *            The route (app/api/courses/route.ts:20-30) likewise applies no
   *            role-dependent filtering.
   *
   * Verified by reading the service before asserting, per the task brief — this
   * is a real gap in the query, not a seeding artefact.
   *
   * Left FAILING intentionally: the fix belongs in app code, which this suite
   * must not touch (CONVENTIONS rule 7).
   */
  test("LEARNER's course list excludes Draft-status courses", async () => {
    const api = await apiAs("learner", REQ);
    const res = await api.get("/api/courses");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Array<{ id: string; status: string }>>;
    const drafts = (body.data ?? []).filter((c) => c.status === "Draft");
    expect(
      drafts.map((c) => c.id),
      "unpublished Draft courses are visible to a LEARNER — courses-service.ts:106 has no status filter",
    ).toHaveLength(0);
    await api.dispose();
  });

  /**
   * FINDING (High) — /player-data is not tenant-scoped: cross-tenant read.
   *
   * Endpoint : GET /api/courses/[id]/player-data
   * Observed : a LEARNER in the fixture org fetches the VICTIM tenant's course
   *            and receives 200 with the foreign course's id, title, description
   *            and status ("OTHER TENANT Course — must never leak").
   * Expected : 403 or 404 — the same answer GET /api/courses/[id] correctly
   *            gives for the identical id (phase01 covers that route; this
   *            sibling route was missed).
   * Root cause: app/api/courses/[id]/player-data/route.ts:9-11 —
   *              const course = await prisma.lmsCourse.findUnique({
   *                where: { id: courseId },      // ← no orgId, no tenantWhere()
   *            `actor.orgId` is read later (line 30) only to look up the
   *            caller's OWN progress row, never to constrain which course may be
   *            fetched. This route hand-writes Prisma instead of going through
   *            `courses-service.findOne(id, orgId)` (courses-service.ts:165-182),
   *            which does scope correctly — exactly the "route that forgets"
   *            pattern phase01 documents.
   *
   * Severity High rather than Critical: the leak is metadata + structure
   * (titles, module/lesson tree, contentUrls) for a known course id, not a
   * mutation and not an enumeration of ids.
   *
   * Left FAILING intentionally.
   */
  test("player-data refuses a course belonging to another tenant", async () => {
    const api = await apiAs("learner", REQ);
    const res = await api.get(`/api/courses/${m.other.courseId}/player-data`);
    const body = (await safeJson(res)) as Ok<{ course: { id: string; title: string } | null }>;
    expect(
      body.data?.course,
      `CROSS-TENANT LEAK: player-data returned "${body.data?.course?.title}" from org ${m.other.orgId}`,
    ).toBeNull();
    await api.dispose();
  });

  /**
   * FINDING (High) — any authenticated role can rewrite course structure.
   *
   * Endpoint : PUT /api/courses/[id]/modules/order
   *            PUT /api/courses/modules/[moduleId]/lessons/order
   * Observed : a LEARNER session reorders the seeded published course's modules
   *            and receives 200; a subsequent admin read confirms orderIndex was
   *            actually rewritten in the database. The change is persistent and
   *            visible to every other user of the tenant.
   * Expected : 403 — reordering curriculum is an authoring action, and the three
   *            sibling write routes in this same feature area
   *            (POST /api/courses, /courses/modules, /courses/lessons) all
   *            enforce ['ADMIN','TENANT_ADMIN','SUB_ADMIN'].
   * Root cause: app/api/courses/[id]/modules/order/route.ts:11-13 and
   *            app/api/courses/modules/[moduleId]/lessons/order/route.ts:11-13.
   *            Both call `requireAuth(req)` and then go straight to the service;
   *            neither imports or calls `requireRoles`. The source comment on
   *            each ("any authenticated user (TenantGuard)") shows this is a
   *            faithful port of a legacy handler that carried a tenant guard but
   *            no @Roles decorator — the authorisation was never there to port.
   *            The service (courses-service.ts:222-231) scopes by orgId, so this
   *            is contained to the caller's own tenant: privilege escalation
   *            within a tenant, not a cross-tenant issue.
   *
   * Left FAILING intentionally (both).
   */
  test("LEARNER cannot reorder a course's modules", async () => {
    const api = await apiAs("learner", REQ);
    const res = await api.put(`/api/courses/${PUBLISHED}/modules/order`, {
      data: { moduleIds: [...MODULE_IDS].reverse() },
    });
    expect(
      [401, 403],
      `PRIVILEGE ESCALATION: LEARNER got ${res.status()} reordering modules — route has requireAuth but no requireRoles`,
    ).toContain(res.status());
    await api.dispose();

    // Whatever the verdict, put the seeded order back so this spec is
    // idempotent and phase07+ see a clean fixture.
    const admin = await apiAs("tenantAdmin", REQ);
    await admin.put(`/api/courses/${PUBLISHED}/modules/order`, { data: { moduleIds: MODULE_IDS } });
    await admin.dispose();
  });

  test("LEARNER cannot reorder a module's lessons", async () => {
    const api = await apiAs("learner", REQ);
    const res = await api.put(`/api/courses/modules/${MODULE_0}/lessons/order`, {
      data: { lessonIndices: [0, 1, 2] },
    });
    expect(
      [401, 403],
      `PRIVILEGE ESCALATION: LEARNER got ${res.status()} reordering lessons — route has requireAuth but no requireRoles`,
    ).toContain(res.status());
    await api.dispose();
  });

  /**
   * FINDING (Low) — an invalid `type` on a lesson returns 500, not 400.
   *
   * Endpoint : POST /api/courses/lessons
   * Observed : `{ moduleId, title, type: "VIDEO" }` → HTTP 500
   *            `{"statusCode":500,"message":"Internal server error"}`.
   *            ("Video" — the correct casing — returns 200.)
   * Expected : 400 with `validationErrors: [{ field: "type", … }]`, the same
   *            treatment the sibling route gives a missing `courseId`.
   * Root cause: app/api/courses/lessons/route.ts:13 validates ONLY the module
   *            reference —
   *              parseBody(req, z.object({ moduleId: z.string() }).passthrough())
   *            — so every other field, `type` included, is passed through
   *            unvalidated. courses-service.ts:209 then blind-casts it:
   *              type: dto.type as LessonType,
   *            and Prisma rejects the value at the driver. That throws a
   *            PrismaClientUnknownRequestError, which lib/http.ts:98-115 does
   *            not special-case (it handles only P2002 and P2025), so it lands
   *            in the catch-all 500 at lib/http.ts:126-134.
   *
   * Impact is low — a caller-supplied bad value, no data exposure — but it
   * turns a client error into a server error, so it pollutes 5xx alerting and
   * gives API consumers no actionable message. The valid values are
   * Video | PDF | PPT | SCORM | Text | Quiz | Audio | Document | Slides
   * (schema.prisma, enum LmsLessonType).
   *
   * Left FAILING intentionally.
   */
  test("POST /api/courses/lessons rejects an invalid lesson type with 400, not 500", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.post("/api/courses/lessons", {
      data: { moduleId: MODULE_0, title: "phase06 bad type", type: "VIDEO" },
    });
    expect(
      res.status(),
      "an unvalidated enum reaches Prisma and surfaces as a 500 instead of a 400",
    ).toBe(400);
    await api.dispose();
  });

  /**
   * INFORMATIONAL — /player-data swallows a missing course into a 200.
   *
   * An unknown id yields `{ success: true, data: { course: null, modules: [],
   * totalLessons: 0 } }` rather than 404 (route.ts:20-25, plus a bare
   * `catch {}` at :83-88 that converts ANY error — including a genuine database
   * fault — into the same empty-but-successful payload). Not a security issue,
   * but it means a client cannot distinguish "no such course", "not yours" and
   * "the database is down". Recorded, asserted as documented behaviour.
   */
  test("[informational] player-data returns an empty success payload for an unknown id", async () => {
    const api = await apiAs("tenantAdmin", REQ);
    const res = await api.get(`/api/courses/${NONEXISTENT}/player-data`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ course: null; totalLessons: number }>;
    expect(body.success).toBe(true);
    expect(body.data?.course).toBeNull();
    expect(body.data?.totalLessons).toBe(0);
    await api.dispose();
  });
});
