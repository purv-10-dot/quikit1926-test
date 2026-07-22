/**
 * PHASE 13 — Exams (`/api/exams/*`).
 *
 * Surface (verified with `grep "^export const" app/api/exams/**\/route.ts`):
 *   GET|POST  /api/exams
 *   GET|PUT   /api/exams/[id]
 *   POST      /api/exams/[id]/publish
 *   POST      /api/exams/[id]/publish-results
 *   GET       /api/exams/student
 *
 * The headline check here is ANSWER-KEY REDACTION. `GET /api/exams/:id` is open
 * to LEARNER (app/api/exams/[id]/route.ts:9-13) and `findOneExam` strips the key
 * for non-staff via `stripAnswerKey` (lib/services/exams-service.ts:196-233).
 * `__tests__/unit/exams-answer-key.test.ts` asserts that contract against a
 * mocked Prisma; this file proves it end-to-end over HTTP, which is the only
 * form that rules out a route-layer regression re-adding the key.
 *
 * FIXTURE NOTE. The seeded "E2E Midterm" is unusable as a live exam fixture:
 * the seed gives it ZERO questions and schedules it for `now + 24h`
 * (packages/database/prisma/seed-quiklms-e2e.ts:303-317), so it can neither be
 * published nor started. It is used only as a read fixture; every test that
 * needs a real exam builds its own from a question it also creates.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT13-${Date.now()}`;

/**
 * Per-request ceiling, deliberately above `use.actionTimeout` (15s,
 * playwright.config.ts:33).
 *
 * `npm run dev` compiles an App-Router route on its FIRST request, and with
 * four workers racing each other a cold handler routinely takes longer than
 * 15s. That surfaces as a Playwright timeout, indistinguishable in the report
 * from a hung handler. Raising the per-call ceiling changes no assertion; the
 * per-test budget still bounds a genuine hang.
 */
const CEIL = 60_000;
const GET = (a: APIRequestContext, p: string) => a.get(p, { timeout: CEIL });
const POST = (a: APIRequestContext, p: string, data?: unknown) =>
  a.post(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const PUT = (a: APIRequestContext, p: string, data: unknown) => a.put(p, { timeout: CEIL, data });

interface Envelope<T> {
  success?: boolean;
  data?: T;
  statusCode?: number;
  message?: string;
}

/** A bank question with a known answer key, used to build publishable exams. */
async function createQuestion(api: APIRequestContext, label: string): Promise<string> {
  const res = await POST(api, "/api/question-bank", {
    subject: RUN,
    topic: "Redaction",
    difficulty: "easy",
    type: "mcq",
    text: `${label} — which option is right?`,
    options: [
      { text: "wrong option", isCorrect: false },
      { text: "right option", isCorrect: true },
    ],
    correctAnswer: "right option",
    explanation: "THIS-EXPLANATION-IS-SECRET",
    points: 5,
    tags: [RUN],
  });
  expect(res.status(), "question bank create").toBe(201);
  const body = (await safeJson(res)) as Envelope<{ id: string }>;
  return body.data!.id;
}

/** A draft exam carrying `questionIds`, scheduled so it is startable right now. */
async function createExam(
  api: APIRequestContext,
  title: string,
  questionIds: string[],
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await POST(api, "/api/exams", {
    title,
    subject: RUN,
    duration: 60,
    questions: questionIds.map((questionId, i) => ({ questionId, points: 5, order: i + 1 })),
    scheduledStartTime: new Date(Date.now() - 60_000).toISOString(),
    scheduledEndTime: new Date(Date.now() + 2 * 3600_000).toISOString(),
    settings: { passingScore: 40 },
    ...extra,
  });
  expect(res.status(), `exam create (${title})`).toBe(201);
  return ((await safeJson(res)) as Envelope<Record<string, unknown>>).data!;
}

// ── Access control ───────────────────────────────────────────────────────────

test.describe("Phase 13 — exams RBAC", () => {
  test("tenantAdmin lists exams and sees the seeded E2E Midterm", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await GET(api, "/api/exams");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<Array<{ title: string }>>;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data!.map((e) => e.title)).toContain("E2E Midterm");
    await api.dispose();
  });

  // `requireRoles(actor, ['TENANT_ADMIN','SUB_ADMIN','TEACHER'])` —
  // app/api/exams/route.ts:10,19. Everyone else must be refused.
  for (const role of ["manager", "parent", "learner"] as const) {
    test(`${role} is refused the exam list`, async () => {
      const api = await apiAs(role);
      const res = await GET(api, "/api/exams");
      expect(res.status(), `expected 403 for ${role}`).toBe(403);
      await api.dispose();
    });
  }

  for (const role of ["manager", "parent", "learner"] as const) {
    test(`${role} cannot create an exam`, async () => {
      const api = await apiAs(role);
      const res = await POST(api, "/api/exams", { title: `${RUN} illegal` });
      expect(res.status(), `expected 403 for ${role}`).toBe(403);
      await api.dispose();
    });
  }

  test("unauthenticated access to /api/exams is rejected", async () => {
    const anon = await apiAnon();
    const res = await GET(anon, "/api/exams");
    expect([401, 403]).toContain(res.status());
    await anon.dispose();
  });

  test("a nonexistent exam id yields 404, not 500", async () => {
    const api = await apiAs("teacher");
    const res = await GET(api, `/api/exams/${MISSING}`);
    expect(res.status()).toBe(404);
    const body = (await safeJson(res)) as Envelope<never>;
    expect(body.statusCode, "lib/http.ts error envelope").toBe(404);
    await api.dispose();
  });

  test("a malformed (non-uuid) exam id yields 404, not a Prisma 500", async () => {
    const api = await apiAs("teacher");
    const res = await GET(api, "/api/exams/not-a-uuid-at-all");
    expect(res.status(), "P2023 must not surface as a 500").toBe(404);
    await api.dispose();
  });
});

// ── Mutations, verified by read-back ─────────────────────────────────────────

test.describe("Phase 13 — exam lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  // Six sequential round-trips against dev routes; the 45s default is a
  // cold-compile coin flip rather than a result (CONVENTIONS rule 3).
  test.setTimeout(120_000);

  let teacher: APIRequestContext;
  let questionId: string;
  let examId: string;

  test.beforeAll(async () => {
    // Hooks do NOT inherit `test.setTimeout()` from the describe body — they keep
    // the 45s default (playwright.config.ts:19). This fixture makes several
    // sequential round-trips against dev routes, which exceeds that on a loaded
    // server and fails as an opaque hook timeout that skips the whole describe.
    test.setTimeout(180_000);
    teacher = await apiAs("teacher");
    questionId = await createQuestion(teacher, `${RUN} lifecycle`);
  });

  test.afterAll(async () => {
    await teacher.dispose();
  });

  test("POST /api/exams creates a draft and the read-back matches", async () => {
    const exam = await createExam(teacher, `${RUN} Lifecycle Exam`, [questionId]);
    examId = exam.id as string;
    expect(exam.status).toBe("draft");
    // totalMarks is derived from the attached questions, not the client.
    expect(exam.totalMarks).toBe(5);

    const res = await GET(teacher, `/api/exams/${examId}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<Record<string, unknown>>;
    expect(body.data!.title).toBe(`${RUN} Lifecycle Exam`);
    expect((body.data!.questions as unknown[]).length).toBe(1);
  });

  test("PUT /api/exams/:id edits a draft and the read-back reflects it", async () => {
    const res = await PUT(teacher, `/api/exams/${examId}`, {
      title: `${RUN} Renamed`,
      instructions: "Read carefully.",
      questions: [{ questionId, points: 7, order: 1 }],
      scheduledStartTime: new Date(Date.now() - 60_000).toISOString(),
      scheduledEndTime: new Date(Date.now() + 2 * 3600_000).toISOString(),
    });
    expect(res.status()).toBe(200);

    const read = (await safeJson(await GET(teacher, `/api/exams/${examId}`))) as Envelope<
      Record<string, unknown>
    >;
    expect(read.data!.title).toBe(`${RUN} Renamed`);
    expect(read.data!.instructions).toBe("Read carefully.");
    expect(read.data!.totalMarks, "totalMarks recomputed from the new points").toBe(7);
  });

  test("POST /api/exams/:id/publish flips the status to published", async () => {
    const res = await POST(teacher, `/api/exams/${examId}/publish`);
    expect(res.status()).toBe(200);
    const read = (await safeJson(await GET(teacher, `/api/exams/${examId}`))) as Envelope<
      Record<string, unknown>
    >;
    expect(read.data!.status).toBe("published");
  });

  test("a published exam can no longer be edited", async () => {
    const res = await PUT(teacher, `/api/exams/${examId}`, { title: "should not stick" });
    expect(res.status(), "exams-service.ts:293 — 'Only draft exams can be edited'").toBe(400);
    const read = (await safeJson(await GET(teacher, `/api/exams/${examId}`))) as Envelope<
      Record<string, unknown>
    >;
    expect(read.data!.title).toBe(`${RUN} Renamed`);
  });

  test("publish-results is refused while the exam is merely published", async () => {
    // exams-service.ts:404 — only `completed` or `active` exams may publish results.
    const res = await POST(teacher, `/api/exams/${examId}/publish-results`);
    expect(res.status()).toBe(400);
  });
});

test.describe("Phase 13 — publish guards", () => {
  test.setTimeout(90_000);

  test("an exam with no questions cannot be published", async () => {
    const teacher = await apiAs("teacher");
    const res = await POST(teacher, "/api/exams", {
      title: `${RUN} Empty`,
      subject: RUN,
      duration: 30,
      scheduledStartTime: new Date().toISOString(),
      scheduledEndTime: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(res.status()).toBe(201);
    const id = ((await safeJson(res)) as Envelope<{ id: string }>).data!.id;

    const pub = await POST(teacher, `/api/exams/${id}/publish`);
    expect(pub.status(), "exams-service.ts:397").toBe(400);
    await teacher.dispose();
  });

  test("an exam with no schedule cannot be published", async () => {
    const teacher = await apiAs("teacher");
    const qId = await createQuestion(teacher, `${RUN} unscheduled`);
    const res = await POST(teacher, "/api/exams", {
      title: `${RUN} Unscheduled`,
      subject: RUN,
      duration: 30,
      questions: [{ questionId: qId, points: 1, order: 1 }],
    });
    const id = ((await safeJson(res)) as Envelope<{ id: string }>).data!.id;

    const pub = await POST(teacher, `/api/exams/${id}/publish`);
    expect(pub.status(), "exams-service.ts:398-400").toBe(400);
    await teacher.dispose();
  });

  test("publish/publish-results on a nonexistent exam yield 404", async () => {
    const teacher = await apiAs("teacher");
    expect((await POST(teacher, `/api/exams/${MISSING}/publish`)).status()).toBe(404);
    expect((await POST(teacher, `/api/exams/${MISSING}/publish-results`)).status()).toBe(404);
    await teacher.dispose();
  });
});

// ── THE ANSWER KEY ───────────────────────────────────────────────────────────

test.describe("Phase 13 — answer-key redaction over HTTP", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  let teacher: APIRequestContext;
  let examId: string;

  test.beforeAll(async () => {
    // Hooks do NOT inherit `test.setTimeout()` from the describe body — they keep
    // the 45s default (playwright.config.ts:19). This fixture makes several
    // sequential round-trips against dev routes, which exceeds that on a loaded
    // server and fails as an opaque hook timeout that skips the whole describe.
    test.setTimeout(180_000);
    teacher = await apiAs("teacher");
    const qId = await createQuestion(teacher, `${RUN} key`);
    const exam = await createExam(teacher, `${RUN} Key Exam`, [qId]);
    examId = exam.id as string;
    await POST(teacher, `/api/exams/${examId}/publish`);
  });

  test.afterAll(async () => {
    await teacher.dispose();
  });

  test("a LEARNER reading an exam receives NO correctAnswer, explanation or isCorrect", async () => {
    const learner = await apiAs("learner");
    const res = await GET(learner, `/api/exams/${examId}`);
    expect(res.status()).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw) as Envelope<{ questions: Array<{ questionId: Record<string, unknown> }> }>;

    const q = body.data!.questions[0].questionId;
    expect(q.correctAnswer, "correctAnswer leaked to a learner").toBeUndefined();
    expect(q.explanation, "explanation leaked to a learner").toBeUndefined();
    for (const opt of q.options as Array<Record<string, unknown>>) {
      expect(opt.isCorrect, "the isCorrect flag marks the right answer").toBeUndefined();
    }

    // Belt and braces: the sentinel string must not appear anywhere on the wire,
    // however deeply nested.
    expect(raw).not.toContain("THIS-EXPLANATION-IS-SECRET");
    expect(raw).not.toContain("isCorrect");
    await learner.dispose();
  });

  test("a LEARNER still sees the option TEXT — the choices are not the key", async () => {
    const learner = await apiAs("learner");
    const body = (await safeJson(await GET(learner, `/api/exams/${examId}`))) as Envelope<{
      questions: Array<{ questionId: { options: Array<{ text: string }>; text: string } }>;
    }>;
    const q = body.data!.questions[0].questionId;
    expect(q.options.map((o) => o.text)).toEqual(["wrong option", "right option"]);
    expect(q.text).toContain("which option is right?");
    await learner.dispose();
  });

  test("staff DO keep the full key — redaction must not break authoring", async () => {
    const res = await GET(teacher, `/api/exams/${examId}`);
    const body = (await safeJson(res)) as Envelope<{
      questions: Array<{ questionId: Record<string, unknown> }>;
    }>;
    const q = body.data!.questions[0].questionId;
    expect(q.correctAnswer).toBe("right option");
    expect(q.explanation).toBe("THIS-EXPLANATION-IS-SECRET");
    expect((q.options as Array<{ isCorrect?: boolean }>)[1].isCorrect).toBe(true);
  });

  test("a PARENT is refused the exam entirely (not merely redacted)", async () => {
    const parent = await apiAs("parent");
    const res = await GET(parent, `/api/exams/${examId}`);
    expect(res.status(), "app/api/exams/[id]/route.ts:11 omits PARENT").toBe(403);
    await parent.dispose();
  });
});

// ── The learner-facing catalogue ─────────────────────────────────────────────

test.describe("Phase 13 — /api/exams/student", () => {
  test("a LEARNER gets their exam catalogue with a mySession field", async () => {
    const learner = await apiAs("learner");
    const res = await GET(learner, "/api/exams/student");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<Array<Record<string, unknown>>>;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    for (const exam of body.data!) {
      expect(exam, "getStudentExams attaches the learner's own session").toHaveProperty("mySession");
      // Only live exams belong in the catalogue — a draft must never appear.
      expect(["published", "active", "completed", "results_published"]).toContain(exam.status);
    }
    await learner.dispose();
  });

  test("the student catalogue never carries a question payload", async () => {
    // getStudentExams selects a fixed column list with no `questions` relation
    // (exams-service.ts:474-482). If that ever grows a question include, the
    // answer key would ship with the catalogue.
    const learner = await apiAs("learner");
    const raw = await (await GET(learner, "/api/exams/student")).text();
    expect(raw).not.toContain("correctAnswer");
    expect(raw).not.toContain("isCorrect");
    await learner.dispose();
  });

  for (const role of ["teacher", "tenantAdmin", "parent"] as const) {
    test(`${role} is refused /api/exams/student`, async () => {
      const api = await apiAs(role);
      const res = await GET(api, "/api/exams/student");
      expect(res.status(), "app/api/exams/student/route.ts:8 — LEARNER only").toBe(403);
      await api.dispose();
    });
  }
});
