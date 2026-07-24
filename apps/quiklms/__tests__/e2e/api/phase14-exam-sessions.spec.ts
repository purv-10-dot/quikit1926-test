/**
 * PHASE 14 — Exam sessions (`/api/exam-sessions/*`), all 11 routes.
 *
 *   POST  /[id]/start            (LEARNER; `id` is the EXAM id, not a session)
 *   PATCH /[id]/save             (LEARNER)
 *   POST  /[id]/submit           (LEARNER)
 *   GET   /[id]/status           (LEARNER)
 *   GET   /[id]/result           (LEARNER)
 *   PATCH /[id]/evaluate         (TENANT_ADMIN | SUB_ADMIN | TEACHER)
 *   POST  /[id]/void             (TENANT_ADMIN | SUB_ADMIN | TEACHER)
 *   GET   /exam/[examId]/my-session    (LEARNER)
 *   GET   /exam/[examId]/submissions   (staff)
 *   GET   /exam/[examId]/analytics     (staff)
 *   GET   /student/[studentId]/results (PARENT | staff)
 *
 * Two security questions drive the file beyond the lifecycle walk:
 *
 *  1. GRADE TAMPERING. `submit` takes no body at all and `save` accepts only
 *     `{answers}` (app/api/exam-sessions/[id]/{submit,save}/route.ts), so a
 *     learner should be unable to post their own `score`. Both are probed with
 *     a poisoned body and the resulting score is compared against the one the
 *     server must compute from the answer key.
 *
 *  2. CROSS-LEARNER ACCESS. Every learner-facing service call filters on
 *     `{id, orgId, studentId}` (lib/services/exam-sessions-service.ts:236,
 *     260, 372, 391). A second learner is provisioned through
 *     `POST /api/auth/register` and pointed at learner A's session id.
 *
 * FIXTURE NOTE. The seeded "E2E Midterm" has no questions and opens in 24h, so
 * it cannot be sat. This file builds its own exam per run — necessarily so:
 * `startSession` is once-per-(exam, student) and refuses a second attempt
 * (exam-sessions-service.ts:75-81), so a re-run against a reused exam would
 * fail on "You have already submitted this exam".
 */

import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest, mintSessionToken } from "../fixtures/auth";

const m = loadManifest();
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3020";
const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT14-${Date.now()}`;
const LEARNER_B_EMAIL = "e2e-learner-b@quiklms.test";

/**
 * Per-request ceiling, deliberately above `use.actionTimeout` (15s,
 * playwright.config.ts:33).
 *
 * `npm run dev` compiles an App-Router route on its FIRST request, and with
 * four workers racing each other a cold `/api/exam-sessions/*` handler
 * routinely blows past 15s. That surfaces as a Playwright timeout, which is
 * indistinguishable in the report from a hung handler — a dev-server artefact
 * masquerading as a finding. Raising the per-call ceiling costs nothing and
 * changes no assertion; the 45s+ test budget still bounds a genuine hang.
 */
const CEIL = 60_000;
const GET = (a: APIRequestContext, p: string) => a.get(p, { timeout: CEIL });
const POST = (a: APIRequestContext, p: string, data?: unknown) =>
  a.post(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const PATCH = (a: APIRequestContext, p: string, data: unknown) =>
  a.patch(p, { timeout: CEIL, data });

interface Envelope<T> {
  success?: boolean;
  data?: T;
  statusCode?: number;
  message?: string;
}

/**
 * A second LEARNER in the same tenant. The manifest ships only one, and
 * "learner A cannot read learner B" is unprovable without a second identity.
 * `POST /api/auth/register` is idempotent (it returns `reused:true` for an
 * existing email), so repeated runs converge on the same user.
 */
async function provisionLearnerB(): Promise<{ id: string; api: APIRequestContext }> {
  const admin = await apiAs("tenantAdmin");
  const res = await POST(admin, "/api/auth/register", {
    email: LEARNER_B_EMAIL,
    firstName: "E2E",
    lastName: "LearnerB",
    role: "LEARNER",
  });
  expect(res.status(), "provisioning the second learner").toBe(201);
  // Read the body BEFORE disposing: a disposed context invalidates its
  // responses, and "Response has been disposed" then fails whichever test
  // happens to run first, pointing nowhere near the real cause.
  const id = ((await safeJson(res)) as Envelope<{ id: string }>).data!.id;
  await admin.dispose();

  // Role resolution keys on LmsUser.id === session.id, so overriding `id`/`sub`
  // is what makes this a genuine second identity rather than learner A again.
  const token = await mintSessionToken("learner", { id, sub: id, email: LEARNER_B_EMAIL });
  const api = await request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: `next-auth.session-token=${token}` },
  });
  return { id, api };
}

/** Build + publish a startable exam. Returns `{examId, questionId, correctIndex}`. */
async function buildLiveExam(teacher: APIRequestContext, label: string) {
  const qRes = await POST(teacher, "/api/question-bank", {
    subject: RUN,
    type: "mcq",
    difficulty: "easy",
    text: `${label} — pick the right one`,
    options: [
      { text: "wrong", isCorrect: false },
      { text: "right", isCorrect: true },
    ],
    correctAnswer: "right",
    explanation: "SESSION-KEY-SECRET",
    points: 10,
    tags: [RUN],
  });
  expect(qRes.status()).toBe(201);
  const questionId = ((await safeJson(qRes)) as Envelope<{ id: string }>).data!.id;

  const eRes = await POST(teacher, "/api/exams", {
    title: `${label} Exam`,
    subject: RUN,
    duration: 60,
    // batchId deliberately omitted: a null-batch exam skips the batch
    // eligibility gate (exam-sessions-service.ts:50-66) and is visible
    // org-wide, so the test does not depend on roster state.
    questions: [{ questionId, points: 10, order: 1 }],
    scheduledStartTime: new Date(Date.now() - 60_000).toISOString(),
    scheduledEndTime: new Date(Date.now() + 2 * 3600_000).toISOString(),
    settings: { passingScore: 40 },
  });
  expect(eRes.status()).toBe(201);
  const examId = ((await safeJson(eRes)) as Envelope<{ id: string }>).data!.id;

  expect((await POST(teacher, `/api/exams/${examId}/publish`)).status()).toBe(200);
  return { examId, questionId, correctIndex: 1 };
}

// ── The full learner → grader lifecycle ──────────────────────────────────────

test.describe("Phase 14 — session lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let teacher: APIRequestContext;
  let learner: APIRequestContext;
  let examId: string;
  let questionId: string;
  let correctIndex: number;
  let sessionId: string;

  test.beforeAll(async () => {
    // Hooks do NOT inherit `test.setTimeout()` from the describe body — they keep
    // the 45s default (playwright.config.ts:19). This fixture makes several
    // sequential round-trips against dev routes, which exceeds that on a loaded
    // server and fails as an opaque hook timeout that skips the whole describe.
    test.setTimeout(180_000);
    teacher = await apiAs("teacher");
    learner = await apiAs("learner");
    ({ examId, questionId, correctIndex } = await buildLiveExam(teacher, `${RUN} Lifecycle`));
  });

  test.afterAll(async () => {
    await teacher.dispose();
    await learner.dispose();
  });

  test("start returns a session whose questions carry NO answer key", async () => {
    const res = await POST(learner, `/api/exam-sessions/${examId}/start`);
    expect(res.status()).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw) as Envelope<{
      sessionId: string;
      status: string;
      questions: Array<Record<string, unknown>>;
      remainingSeconds: number;
    }>;

    sessionId = body.data!.sessionId;
    expect(sessionId).toBeTruthy();
    expect(body.data!.status).toBe("in_progress");
    expect(body.data!.remainingSeconds).toBeGreaterThan(0);
    expect(body.data!.questions).toHaveLength(1);

    // getSessionWithQuestions projects a fixed column list and re-maps options
    // to `{text}` only (exam-sessions-service.ts:120-140). Nothing that names
    // the right answer may cross the wire.
    expect(raw).not.toContain("isCorrect");
    expect(raw).not.toContain("correctAnswer");
    expect(raw).not.toContain("SESSION-KEY-SECRET");
  });

  test("start is idempotent while in progress — it resumes the same session", async () => {
    const res = await POST(learner, `/api/exam-sessions/${examId}/start`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{ sessionId: string }>;
    expect(body.data!.sessionId, "a second start must not fork a new attempt").toBe(sessionId);
  });

  test("save persists partial answers and IGNORES an injected score", async () => {
    const res = await PATCH(learner, `/api/exam-sessions/${sessionId}/save`, {
      answers: { [questionId]: { selectedOptionIndices: [correctIndex] } },
      // Grade-tampering attempt: none of these are in the route's zod schema
      // (app/api/exam-sessions/[id]/save/route.ts:8) and must be stripped.
      score: 9999,
      percentage: 100,
      passed: true,
      status: "submitted",
    });
    expect(res.status()).toBe(200);
    expect(((await safeJson(res)) as Envelope<{ saved: boolean }>).data!.saved).toBe(true);

    const status = (await safeJson(
      await GET(learner, `/api/exam-sessions/${sessionId}/status`),
    )) as Envelope<{ status: string; answeredCount: number }>;
    expect(status.data!.answeredCount).toBe(1);
    expect(status.data!.status, "an injected status must not stick").toBe("in_progress");
  });

  test("submit scores server-side and IGNORES an injected score", async () => {
    const res = await POST(learner, `/api/exam-sessions/${sessionId}/submit`, {
      score: 9999,
      percentage: 100,
      passed: true,
      totalPoints: 9999,
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{
      score: number;
      totalPoints: number;
      percentage: number;
      passed: boolean;
      status: string;
    }>;

    // The question is worth 10 and was answered correctly, so the only
    // legitimate score is 10. A 9999 would mean the client set its own grade.
    expect(body.data!.score, "score must be recomputed from the answer key").toBe(10);
    expect(body.data!.totalPoints).toBe(10);
    expect(body.data!.percentage).toBe(100);
    expect(body.data!.passed).toBe(true);
    expect(body.data!.status).toBe("submitted");
  });

  test("re-submitting a finished session is refused", async () => {
    const res = await POST(learner, `/api/exam-sessions/${sessionId}/submit`);
    expect(res.status(), "exam-sessions-service.ts:262").toBe(400);
  });

  test("result is withheld until the exam publishes results", async () => {
    const res = await GET(learner, `/api/exam-sessions/${sessionId}/result`);
    expect(res.status(), "exam-sessions-service.ts:394 — Forbidden until published").toBe(403);
  });

  test("after publish-results the learner can read their own result", async () => {
    // The exam went `published` → `active` when the session started, which is
    // what makes publish-results legal here (exams-service.ts:404).
    const pub = await POST(teacher, `/api/exams/${examId}/publish-results`);
    expect(pub.status(), `publish-results said: ${await pub.text()}`).toBe(200);

    const res = await GET(learner, `/api/exam-sessions/${sessionId}/result`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{
      score: number;
      examId: { title: string; status: string };
    }>;
    expect(body.data!.score).toBe(10);
    // `.populate('examId')` parity — examId is the exam doc, not a raw uuid.
    expect(body.data!.examId.title).toBe(`${RUN} Lifecycle Exam`);
    expect(body.data!.examId.status).toBe("results_published");
  });

  test("my-session mirrors the graded result for the learner", async () => {
    const res = await GET(learner, `/api/exam-sessions/exam/${examId}/my-session`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{
      sessionId: string;
      score: number;
      passed: boolean;
    }>;
    expect(body.data!.sessionId).toBe(sessionId);
    expect(body.data!.score).toBe(10);
    expect(body.data!.passed).toBe(true);
  });

  test("the grader sees the submission with the student populated", async () => {
    const res = await GET(teacher, `/api/exam-sessions/exam/${examId}/submissions`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<
      Array<{ _id: string; studentId: { email: string } }>
    >;
    const row = body.data!.find((s) => s._id === sessionId);
    expect(row, "the submitted session must appear in the grader's list").toBeTruthy();
    // `_id` and the populated student are both restored deliberately — the
    // evaluation UI keys rows off `_id` and renders `studentId.email`.
    expect(row!.studentId.email).toBe(m.users.learner.email.toLowerCase());
  });

  test("analytics aggregates the submission", async () => {
    const res = await GET(teacher, `/api/exam-sessions/exam/${examId}/analytics`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{
      totalSubmissions: number;
      passRate: number;
      questionAccuracy: Array<{ questionId: string; correct: number; attempted: number }>;
    }>;
    expect(body.data!.totalSubmissions).toBe(1);
    expect(body.data!.passRate).toBe(100);
    const acc = body.data!.questionAccuracy.find((q) => q.questionId === questionId);
    expect(acc).toBeTruthy();
    expect(acc!.correct).toBe(1);
    expect(acc!.attempted).toBe(1);
  });

  test("evaluate overrides the score and the read-back proves it stuck", async () => {
    const res = await PATCH(teacher, `/api/exam-sessions/${sessionId}/evaluate`, {
      score: 6,
      teacherRemarks: `${RUN} remark`,
    });
    expect(res.status()).toBe(200);

    const read = (await safeJson(
      await GET(teacher, `/api/exam-sessions/exam/${examId}/submissions`),
    )) as Envelope<
      Array<{ _id: string; score: number; percentage: number; teacherRemarks: string }>
    >;
    const row = read.data!.find((s) => s._id === sessionId)!;
    expect(row.score).toBe(6);
    expect(row.percentage, "6/10 recomputed against totalPoints").toBe(60);
    expect(row.teacherRemarks).toBe(`${RUN} remark`);
  });

  test("student results list the graded session for staff", async () => {
    const res = await GET(teacher, `/api/exam-sessions/student/${m.users.learner.lmsUserId}/results`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<
      Array<{ sessionId: string; score: number; resultsPublished: boolean }>
    >;
    const row = body.data!.find((r) => r.sessionId === sessionId);
    expect(row).toBeTruthy();
    expect(row!.score).toBe(6);
    expect(row!.resultsPublished).toBe(true);
  });

  test("void flips the session to voided and the read-back confirms it", async () => {
    const res = await POST(teacher, `/api/exam-sessions/${sessionId}/void`);
    expect(res.status()).toBe(200);

    const read = (await safeJson(
      await GET(teacher, `/api/exam-sessions/exam/${examId}/submissions`),
    )) as Envelope<Array<{ _id: string; status: string }>>;
    expect(read.data!.find((s) => s._id === sessionId)!.status).toBe("voided");
  });
});

// ── Cross-learner isolation ──────────────────────────────────────────────────

test.describe("Phase 14 — a learner cannot touch another learner's session", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let teacher: APIRequestContext;
  let learnerA: APIRequestContext;
  let learnerB: APIRequestContext;
  let learnerBId: string;
  let examId: string;
  let questionId: string;
  let sessionA: string;

  test.beforeAll(async () => {
    // Hooks do NOT inherit `test.setTimeout()` from the describe body — they keep
    // the 45s default (playwright.config.ts:19). This fixture makes several
    // sequential round-trips against dev routes, which exceeds that on a loaded
    // server and fails as an opaque hook timeout that skips the whole describe.
    test.setTimeout(180_000);
    teacher = await apiAs("teacher");
    learnerA = await apiAs("learner");
    ({ examId, questionId } = await buildLiveExam(teacher, `${RUN} CrossLearner`));
    ({ id: learnerBId, api: learnerB } = await provisionLearnerB());

    const res = await POST(learnerA, `/api/exam-sessions/${examId}/start`);
    sessionA = ((await safeJson(res)) as Envelope<{ sessionId: string }>).data!.sessionId;
    await PATCH(learnerA, `/api/exam-sessions/${sessionA}/save`, {
      answers: { [questionId]: { selectedOptionIndices: [1] } },
    });
  });

  test.afterAll(async () => {
    await teacher.dispose();
    await learnerA.dispose();
    await learnerB?.dispose();
  });

  test("the fixture really is a second identity", async () => {
    // If provisioning ever returned learner A's id, every isolation assertion
    // below would pass vacuously.
    expect(learnerBId).toBeTruthy();
    expect(learnerBId).not.toBe(m.users.learner.lmsUserId);
    const profile = (await safeJson(await GET(learnerB, "/api/auth/profile"))) as Envelope<{
      id: string;
      role: string;
    }>;
    expect(profile.data!.id).toBe(learnerBId);
    expect(profile.data!.role, "a mis-minted session silently downgrades to LEARNER anyway").toBe(
      "LEARNER",
    );
  });

  test("learner B cannot read learner A's session status", async () => {
    const res = await GET(learnerB, `/api/exam-sessions/${sessionA}/status`);
    expect(res.status(), "LEAK: B read A's live progress").toBe(404);
  });

  test("learner B cannot read learner A's result", async () => {
    const res = await GET(learnerB, `/api/exam-sessions/${sessionA}/result`);
    expect(res.status(), "LEAK: B read A's result").toBe(404);
  });

  test("learner B cannot overwrite learner A's answers", async () => {
    const res = await PATCH(learnerB, `/api/exam-sessions/${sessionA}/save`, {
      answers: { [questionId]: { selectedOptionIndices: [0] } },
    });
    expect(res.status(), "WRITE LEAK: B sabotaged A's answers").toBe(404);

    // And A's answer survives untouched.
    const status = (await safeJson(
      await GET(learnerA, `/api/exam-sessions/${sessionA}/status`),
    )) as Envelope<{ answeredCount: number; status: string }>;
    expect(status.data!.answeredCount).toBe(1);
    expect(status.data!.status).toBe("in_progress");
  });

  test("learner B cannot force-submit learner A's exam", async () => {
    const res = await POST(learnerB, `/api/exam-sessions/${sessionA}/submit`);
    expect(res.status(), "WRITE LEAK: B ended A's attempt").toBe(404);
  });

  test("learner B's own my-session for the same exam is empty, not A's", async () => {
    const res = await GET(learnerB, `/api/exam-sessions/exam/${examId}/my-session`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{ sessionId?: string } | null>;
    // B never started: getMySession returns null rather than A's row.
    expect(body.data ?? null, "LEAK: my-session resolved to another learner").toBeNull();
  });

  test("learner B cannot evaluate or void learner A's session", async () => {
    expect(
      (await PATCH(learnerB, `/api/exam-sessions/${sessionA}/evaluate`, { score: 10 })).status(),
    ).toBe(403);
    expect((await POST(learnerB, `/api/exam-sessions/${sessionA}/void`)).status()).toBe(403);
  });

  test("a PARENT must not read an unrelated student's exam results", async () => {
    /**
     * FAILING BY DESIGN — verified.
     *
     * The route admits PARENT by design
     * (app/api/exam-sessions/student/[studentId]/results/route.ts:8), which is
     * reasonable — but nothing then checks that the student in the path is
     * that parent's child. `getStudentResults` filters on `{studentId, orgId}`
     * alone (lib/services/exam-sessions-service.ts:454-458), so the
     * `studentId` path parameter is trusted verbatim.
     *
     * The link table this needs already exists — `LmsUserParent`
     * (packages/database/prisma/schema.prisma:16494-16509) — and no code on
     * this path reads it. The seeded parent has no child link whatsoever, so
     * the 200 observed here is an unrelated adult reading a named student's
     * complete exam history: every exam title, score, percentage, pass/fail
     * and teacher remark.
     *
     * This is the SAME defect, from the same cause, as the two asserted in
     * phase17 (gradebook) and phase18 (homework submissions): a parent-facing
     * endpoint that trusts a student id from the URL. Fixing one without the
     * other two leaves the data reachable by another route.
     *
     * Severity: High — unauthorized access to a minor's academic record,
     * enumerable by student id, from an ordinary parent account.
     */
    const parent = await apiAs("parent");
    const res = await GET(parent, `/api/exam-sessions/student/${m.users.learner.lmsUserId}/results`);
    const rows = ((await safeJson(res)) as Envelope<Array<{ sessionId: string }>>).data ?? [];
    await parent.dispose();
    expect(
      rows,
      "MISSING AUTHORIZATION: a PARENT with no parent↔child link read another student's exam " +
        "results (app/api/exam-sessions/student/[studentId]/results/route.ts:8 admits PARENT and " +
        "exam-sessions-service.ts:454-458 trusts the studentId path parameter).",
    ).toHaveLength(0);
  });
});

// ── Guards, roles and error shapes ───────────────────────────────────────────

test.describe("Phase 14 — guards", () => {
  test.setTimeout(120_000);

  test("a nonexistent session id yields 404 on every learner route", async () => {
    const learner = await apiAs("learner");
    expect((await GET(learner, `/api/exam-sessions/${MISSING}/status`)).status()).toBe(404);
    expect((await GET(learner, `/api/exam-sessions/${MISSING}/result`)).status()).toBe(404);
    expect(
      (await PATCH(learner, `/api/exam-sessions/${MISSING}/save`, { answers: {} })).status(),
    ).toBe(404);
    expect((await POST(learner, `/api/exam-sessions/${MISSING}/submit`)).status()).toBe(404);
    await learner.dispose();
  });

  test("a nonexistent session id yields 404 on the grader routes", async () => {
    const teacher = await apiAs("teacher");
    expect(
      (await PATCH(teacher, `/api/exam-sessions/${MISSING}/evaluate`, { score: 1 })).status(),
    ).toBe(404);
    expect((await POST(teacher, `/api/exam-sessions/${MISSING}/void`)).status()).toBe(404);
    await teacher.dispose();
  });

  test("starting a nonexistent exam yields 404", async () => {
    const learner = await apiAs("learner");
    expect((await POST(learner, `/api/exam-sessions/${MISSING}/start`)).status()).toBe(404);
    await learner.dispose();
  });

  test("the seeded E2E Midterm cannot be started before its window opens", async () => {
    // Seeded with `scheduledStartTime = now + 24h`
    // (packages/database/prisma/seed-quiklms-e2e.ts:314). A 200 here would mean
    // the schedule gate (exam-sessions-service.ts:69-70) stopped working.
    const admin = await apiAs("tenantAdmin");
    const list = (await safeJson(await GET(admin, "/api/exams"))) as Envelope<
      Array<{ id: string; title: string }>
    >;
    const midterm = list.data!.find((e) => e.title === "E2E Midterm");
    await admin.dispose();
    test.skip(!midterm, "seeded E2E Midterm not present");

    const learner = await apiAs("learner");
    const res = await POST(learner, `/api/exam-sessions/${midterm!.id}/start`);
    expect(res.status()).toBe(400);
    expect(((await safeJson(res)) as Envelope<never>).message).toContain("not started");
    await learner.dispose();
  });

  test("evaluate rejects a non-numeric score with a 400 + validationErrors", async () => {
    const teacher = await apiAs("teacher");
    const res = await PATCH(teacher, `/api/exam-sessions/${MISSING}/evaluate`, {
      score: "one hundred",
    });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { validationErrors?: unknown[] };
    expect(Array.isArray(body.validationErrors)).toBe(true);
    await teacher.dispose();
  });

  for (const role of ["manager", "parent", "teacher"] as const) {
    test(`${role} cannot use the learner-only session routes`, async () => {
      const api = await apiAs(role);
      expect((await POST(api, `/api/exam-sessions/${MISSING}/start`)).status()).toBe(403);
      expect((await GET(api, `/api/exam-sessions/${MISSING}/status`)).status()).toBe(403);
      await api.dispose();
    });
  }

  for (const role of ["learner", "parent"] as const) {
    test(`${role} cannot read another cohort's submissions or analytics`, async () => {
      const api = await apiAs(role);
      expect((await GET(api, `/api/exam-sessions/exam/${MISSING}/submissions`)).status()).toBe(403);
      expect((await GET(api, `/api/exam-sessions/exam/${MISSING}/analytics`)).status()).toBe(403);
      await api.dispose();
    });
  }

  test("a LEARNER cannot read the per-student results endpoint", async () => {
    const learner = await apiAs("learner");
    const res = await GET(learner, `/api/exam-sessions/student/${m.users.learner.lmsUserId}/results`);
    expect(res.status(), "route admits PARENT + staff only").toBe(403);
    await learner.dispose();
  });

  test("unauthenticated session access is rejected", async () => {
    const anon = await apiAnon();
    expect([401, 403]).toContain(
      (await GET(anon, `/api/exam-sessions/${MISSING}/status`)).status(),
    );
    await anon.dispose();
  });
});
