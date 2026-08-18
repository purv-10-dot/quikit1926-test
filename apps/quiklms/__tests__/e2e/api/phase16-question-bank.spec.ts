/**
 * PHASE 16 — Question bank (`/api/question-bank/*`), all 7 routes.
 *
 *   GET|POST        /api/question-bank
 *   GET|PUT|DELETE  /api/question-bank/[id]
 *   POST            /api/question-bank/bulk
 *   GET             /api/question-bank/count
 *   GET             /api/question-bank/subjects
 *   GET             /api/question-bank/topics
 *   GET             /api/question-bank/tags
 *
 * Every route is TENANT_ADMIN | SUB_ADMIN | TEACHER and takes its tenant scope
 * from `actor.orgId` rather than the body, so the interesting behaviour is in
 * the service: soft delete (`isActive:false`, never a row delete), all-or-
 * nothing bulk import inside a `$transaction`
 * (lib/services/question-bank-service.ts:100-118), and the repeated-`?tags=`
 * query parsing that `searchParams.get()` used to silently truncate.
 *
 * The bank holds the ANSWER KEY for every exam, so "who may read it" is a
 * cheating-surface question, not merely an RBAC one — hence the explicit
 * learner/parent/manager refusal matrix.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";

const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT16-${Date.now()}`;
const SUBJECT = `${RUN}-Subject`;

/** See the note in phase14: dev-server cold compiles blow the 15s actionTimeout. */
const CEIL = 60_000;
const GET = (a: APIRequestContext, p: string) => a.get(p, { timeout: CEIL });
const POST = (a: APIRequestContext, p: string, data?: unknown) =>
  a.post(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const PUT = (a: APIRequestContext, p: string, data: unknown) => a.put(p, { timeout: CEIL, data });
const DELETE = (a: APIRequestContext, p: string) => a.delete(p, { timeout: CEIL });

interface Envelope<T> {
  success?: boolean;
  data?: T;
  /** Success-response business message (route-supplied, e.g. "…deactivated"). */
  message?: string;
  /** Error-response message (lib/http.ts's `{success:false,error}` envelope). */
  error?: string;
}
interface ListEnvelope {
  success?: boolean;
  questions?: Array<Record<string, unknown>>;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

function questionPayload(overrides: Record<string, unknown> = {}) {
  return {
    subject: SUBJECT,
    topic: `${RUN}-Topic`,
    difficulty: "medium",
    type: "mcq",
    text: `${RUN} — capital of nowhere?`,
    options: [
      { text: "Alpha", isCorrect: false },
      { text: "Beta", isCorrect: true },
    ],
    correctAnswer: "Beta",
    explanation: "Because Beta.",
    points: 3,
    negativeMarks: 1,
    tags: [`${RUN}-tagA`, `${RUN}-tagB`],
    ...overrides,
  };
}

// ── CRUD, verified by read-back ──────────────────────────────────────────────

test.describe("Phase 16 — question CRUD", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let teacher: APIRequestContext;
  let questionId: string;

  test.beforeAll(async () => {
    // Hooks do NOT inherit `test.setTimeout()` from the describe body — they keep
    // the 45s default (playwright.config.ts:19). This fixture makes several
    // sequential round-trips against dev routes, which exceeds that on a loaded
    // server and fails as an opaque hook timeout that skips the whole describe.
    test.setTimeout(180_000);
    teacher = await apiAs("teacher");
  });
  test.afterAll(async () => {
    await teacher.dispose();
  });

  test("POST creates a question and returns 201 with the stored row", async () => {
    const res = await POST(teacher, "/api/question-bank", questionPayload());
    // CLAUDE.md: "POST returns 201 on creation" — the route says so explicitly
    // (app/api/question-bank/route.ts:48-50).
    expect(res.status()).toBe(201);
    const body = (await safeJson(res)) as Envelope<Record<string, unknown>>;
    expect(body.success).toBe(true);
    questionId = body.data!.id as string;
    expect(questionId).toBeTruthy();
    expect(body.data!.subject).toBe(SUBJECT);
    expect(body.data!.points).toBe(3);
    expect(body.data!.isActive).toBe(true);
  });

  test("the created question reads back by id with its answer key intact", async () => {
    const res = await GET(teacher, `/api/question-bank/${questionId}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<Record<string, unknown>>;
    expect(body.data!.text).toContain("capital of nowhere");
    // Staff MUST keep the key here — this is the authoring surface.
    expect(body.data!.correctAnswer).toBe("Beta");
    expect(body.data!.explanation).toBe("Because Beta.");
    expect((body.data!.options as Array<{ isCorrect: boolean }>)[1].isCorrect).toBe(true);
  });

  test("the question appears in the paginated list with correct envelope fields", async () => {
    const res = await GET(teacher, `/api/question-bank?subject=${encodeURIComponent(SUBJECT)}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as ListEnvelope;
    // NOTE the shape: `{success, questions, total, page, limit, totalPages}` —
    // spread at the top level, NOT under `data` (app/api/question-bank/route.ts:39).
    expect(body.success).toBe(true);
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBe(1);
    expect(body.questions!.some((q) => q.id === questionId)).toBe(true);
  });

  test("PUT updates the question and the read-back reflects every field", async () => {
    const res = await PUT(teacher, `/api/question-bank/${questionId}`, {
      text: `${RUN} — EDITED`,
      difficulty: "hard",
      points: 9,
      explanation: "Edited explanation.",
    });
    expect(res.status()).toBe(200);

    const read = (await safeJson(await GET(teacher, `/api/question-bank/${questionId}`))) as Envelope<
      Record<string, unknown>
    >;
    expect(read.data!.text).toBe(`${RUN} — EDITED`);
    expect(read.data!.difficulty).toBe("hard");
    expect(read.data!.points).toBe(9);
    expect(read.data!.explanation).toBe("Edited explanation.");
    // Untouched fields survive a partial update.
    expect(read.data!.subject).toBe(SUBJECT);
  });

  test("PUT cannot re-key a question into another tenant", async () => {
    // `updateQuestion` strips `id`/`orgId`/`createdBy`/timestamps from the
    // payload before writing (question-bank-service.ts:80-82), so a client
    // cannot hand its question to another org or forge provenance.
    const res = await PUT(teacher, `/api/question-bank/${questionId}`, {
      orgId: "some-other-org",
      id: MISSING,
      createdBy: MISSING,
    });
    expect(res.status()).toBe(200);

    const read = (await safeJson(await GET(teacher, `/api/question-bank/${questionId}`))) as Envelope<
      Record<string, unknown>
    >;
    expect(read.data!.id, "the id must not be rewritable").toBe(questionId);
    expect(read.data!.orgId, "WRITE LEAK: orgId was taken from the body").not.toBe("some-other-org");
    expect(read.data!.createdBy).not.toBe(MISSING);
  });

  test("DELETE soft-deletes: the row survives but leaves the active list", async () => {
    const res = await DELETE(teacher, `/api/question-bank/${questionId}`);
    expect(res.status()).toBe(200);
    expect(((await safeJson(res)) as Envelope<never>).message).toContain("deactivated");

    // Still fetchable by id — `softDeleteQuestion` flips isActive, it does not
    // delete (question-bank-service.ts:86-89). Exam history depends on that.
    const read = (await safeJson(await GET(teacher, `/api/question-bank/${questionId}`))) as Envelope<
      Record<string, unknown>
    >;
    expect(read.data!.isActive).toBe(false);

    // …but gone from the default (isActive) listing.
    const list = (await safeJson(
      await GET(teacher, `/api/question-bank?subject=${encodeURIComponent(SUBJECT)}`),
    )) as ListEnvelope;
    expect(list.questions!.some((q) => q.id === questionId)).toBe(false);
  });
});

// ── Bulk import ──────────────────────────────────────────────────────────────

test.describe("Phase 16 — bulk import", () => {
  test.setTimeout(120_000);

  test("bulk creates every question and reports the count", async () => {
    const teacher = await apiAs("teacher");
    const bulkSubject = `${RUN}-Bulk`;
    const res = await POST(teacher, "/api/question-bank/bulk", {
      questions: [
        questionPayload({ subject: bulkSubject, text: `${RUN} bulk 1` }),
        questionPayload({ subject: bulkSubject, text: `${RUN} bulk 2` }),
        questionPayload({ subject: bulkSubject, text: `${RUN} bulk 3` }),
      ],
    });
    expect(res.status()).toBe(201);
    const body = (await safeJson(res)) as Envelope<unknown[]> & { count?: number };
    expect(body.count).toBe(3);
    expect(body.data).toHaveLength(3);

    const list = (await safeJson(
      await GET(teacher, `/api/question-bank?subject=${encodeURIComponent(bulkSubject)}`),
    )) as ListEnvelope;
    expect(list.total).toBe(3);
    await teacher.dispose();
  });

  test("bulk is ALL-OR-NOTHING — one bad row commits none of them", async () => {
    const teacher = await apiAs("teacher");
    const atomicSubject = `${RUN}-Atomic`;
    const res = await POST(teacher, "/api/question-bank/bulk", {
      questions: [
        questionPayload({ subject: atomicSubject, text: `${RUN} good 1` }),
        // `type` is an enum column; "not-a-real-type" cannot be persisted.
        questionPayload({ subject: atomicSubject, text: `${RUN} bad`, type: "not-a-real-type" }),
        questionPayload({ subject: atomicSubject, text: `${RUN} good 2` }),
      ],
    });
    expect(res.status(), "an invalid row must not yield a success").not.toBe(201);

    // The point of the $transaction (question-bank-service.ts:112-118): a
    // partial import would leave the admin re-uploading and duplicating rows.
    const list = (await safeJson(
      await GET(teacher, `/api/question-bank?subject=${encodeURIComponent(atomicSubject)}`),
    )) as ListEnvelope;
    expect(list.total, "PARTIAL IMPORT: some rows from a failed bulk survived").toBe(0);
    await teacher.dispose();
  });

  test("an empty bulk payload is accepted as a no-op", async () => {
    const teacher = await apiAs("teacher");
    const res = await POST(teacher, "/api/question-bank/bulk", { questions: [] });
    expect(res.status()).toBe(201);
    expect(((await safeJson(res)) as { count?: number }).count).toBe(0);
    await teacher.dispose();
  });
});

// ── Facets: count / subjects / topics / tags ─────────────────────────────────

test.describe("Phase 16 — facets", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  const facetSubject = `${RUN}-Facet`;
  let teacher: APIRequestContext;

  test.beforeAll(async () => {
    // Hooks do NOT inherit `test.setTimeout()` from the describe body — they keep
    // the 45s default (playwright.config.ts:19). This fixture makes several
    // sequential round-trips against dev routes, which exceeds that on a loaded
    // server and fails as an opaque hook timeout that skips the whole describe.
    test.setTimeout(180_000);
    teacher = await apiAs("teacher");
    await POST(teacher, "/api/question-bank/bulk", {
      questions: [
        questionPayload({ subject: facetSubject, topic: `${RUN}-T1`, difficulty: "easy", tags: [`${RUN}-x`] }),
        questionPayload({ subject: facetSubject, topic: `${RUN}-T2`, difficulty: "hard", tags: [`${RUN}-y`] }),
        questionPayload({ subject: facetSubject, topic: `${RUN}-T2`, difficulty: "hard", tags: [`${RUN}-x`, `${RUN}-y`] }),
      ],
    });
  });
  test.afterAll(async () => {
    await teacher.dispose();
  });

  test("count honours subject + difficulty filters", async () => {
    const all = await GET(teacher, `/api/question-bank/count?subject=${encodeURIComponent(facetSubject)}`);
    expect(all.status()).toBe(200);
    expect(((await safeJson(all)) as Envelope<number>).data).toBe(3);

    const hard = await GET(
      teacher,
      `/api/question-bank/count?subject=${encodeURIComponent(facetSubject)}&difficulty=hard`,
    );
    expect(((await safeJson(hard)) as Envelope<number>).data).toBe(2);
  });

  test("REPEATED ?tags= params are all honoured, not just the first", async () => {
    // `searchParams.get()` returns only the first value; the routes use
    // `getAll()` + a comma split (app/api/question-bank/count/route.ts:13-17).
    // Repeated and comma forms must agree, and both must match `hasSome`.
    const repeated = await GET(
      teacher,
      `/api/question-bank/count?subject=${encodeURIComponent(facetSubject)}&tags=${RUN}-x&tags=${RUN}-y`,
    );
    const comma = await GET(
      teacher,
      `/api/question-bank/count?subject=${encodeURIComponent(facetSubject)}&tags=${RUN}-x,${RUN}-y`,
    );
    const rN = ((await safeJson(repeated)) as Envelope<number>).data;
    const cN = ((await safeJson(comma)) as Envelope<number>).data;
    expect(rN, "repeated and comma-separated tag params must agree").toBe(cN);
    // hasSome over both tags matches all three rows.
    expect(rN).toBe(3);

    const single = await GET(
      teacher,
      `/api/question-bank/count?subject=${encodeURIComponent(facetSubject)}&tags=${RUN}-y`,
    );
    expect(((await safeJson(single)) as Envelope<number>).data).toBe(2);
  });

  test("subjects lists the distinct subject", async () => {
    const res = await GET(teacher, "/api/question-bank/subjects");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<string[]>;
    expect(body.data).toContain(facetSubject);
  });

  test("topics is scoped by subject", async () => {
    const res = await GET(
      teacher,
      `/api/question-bank/topics?subject=${encodeURIComponent(facetSubject)}`,
    );
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<string[]>;
    expect(body.data!.sort()).toEqual([`${RUN}-T1`, `${RUN}-T2`]);
  });

  test("tags flattens every distinct tag", async () => {
    const res = await GET(teacher, "/api/question-bank/tags");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<string[]>;
    expect(body.data).toContain(`${RUN}-x`);
    expect(body.data).toContain(`${RUN}-y`);
  });

  test("search + pagination bound the result set", async () => {
    const res = await GET(
      teacher,
      `/api/question-bank?subject=${encodeURIComponent(facetSubject)}&limit=2&page=1`,
    );
    const body = (await safeJson(res)) as ListEnvelope;
    expect(body.questions).toHaveLength(2);
    expect(body.total).toBe(3);
    expect(body.totalPages).toBe(2);

    const p2 = (await safeJson(
      await GET(teacher, `/api/question-bank?subject=${encodeURIComponent(facetSubject)}&limit=2&page=2`),
    )) as ListEnvelope;
    expect(p2.questions).toHaveLength(1);
  });
});

// ── Access control and error shapes ──────────────────────────────────────────

test.describe("Phase 16 — guards", () => {
  test.setTimeout(120_000);

  // The bank IS the answer key for every exam. A learner reaching it is a
  // cheating hole, not merely a permissions slip.
  for (const role of ["learner", "parent", "manager"] as const) {
    test(`${role} cannot read the question bank`, async () => {
      const api = await apiAs(role);
      expect((await GET(api, "/api/question-bank")).status()).toBe(403);
      expect((await GET(api, `/api/question-bank/${MISSING}`)).status()).toBe(403);
      expect((await GET(api, "/api/question-bank/subjects")).status()).toBe(403);
      await api.dispose();
    });
  }

  for (const role of ["learner", "parent", "manager"] as const) {
    test(`${role} cannot write to the question bank`, async () => {
      const api = await apiAs(role);
      expect((await POST(api, "/api/question-bank", questionPayload())).status()).toBe(403);
      expect(
        (await POST(api, "/api/question-bank/bulk", { questions: [questionPayload()] })).status(),
      ).toBe(403);
      expect((await PUT(api, `/api/question-bank/${MISSING}`, { text: "x" })).status()).toBe(403);
      expect((await DELETE(api, `/api/question-bank/${MISSING}`)).status()).toBe(403);
      await api.dispose();
    });
  }

  test("a nonexistent question id yields 404 on GET/PUT/DELETE, not 500", async () => {
    const teacher = await apiAs("teacher");
    expect((await GET(teacher, `/api/question-bank/${MISSING}`)).status()).toBe(404);
    expect((await PUT(teacher, `/api/question-bank/${MISSING}`, { text: "x" })).status()).toBe(404);
    expect((await DELETE(teacher, `/api/question-bank/${MISSING}`)).status()).toBe(404);
    await teacher.dispose();
  });

  test("a malformed (non-uuid) question id yields 404, not a Prisma 500", async () => {
    const teacher = await apiAs("teacher");
    const res = await GET(teacher, "/api/question-bank/not-a-uuid-at-all");
    expect(res.status()).toBe(404);
    expect(((await safeJson(res)) as Envelope<never>).success).toBe(false);
    await teacher.dispose();
  });

  test("unauthenticated access is rejected on every question-bank route", async () => {
    const anon = await apiAnon();
    for (const p of [
      "/api/question-bank",
      "/api/question-bank/count",
      "/api/question-bank/subjects",
      "/api/question-bank/topics",
      "/api/question-bank/tags",
    ]) {
      expect([401, 403], `${p} was reachable anonymously`).toContain((await GET(anon, p)).status());
    }
    await anon.dispose();
  });

  test("tenantAdmin has the same access as teacher", async () => {
    const admin = await apiAs("tenantAdmin");
    expect((await GET(admin, "/api/question-bank")).status()).toBe(200);
    expect((await GET(admin, "/api/question-bank/count")).status()).toBe(200);
    await admin.dispose();
  });
});
