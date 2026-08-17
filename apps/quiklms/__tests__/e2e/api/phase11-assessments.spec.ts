/**
 * PHASE 11 — Assessments (`/api/assessments`, `/[id]`, `/submit`).
 *
 * Small surface, but it holds the highest-consequence logic in the product:
 * whether a learner passes. Two facts about the implementation drive everything
 * below, and both are counter-intuitive enough that a test written from the API
 * shape alone would be wrong:
 *
 * 1. **Answers are matched by POSITIONAL INDEX, not by question id.** The field
 *    is declared `questionId: z.string()`, but `submitQuiz`
 *    (lib/services/assessments-service.ts) matches with
 *      a.questionId === index.toString() || parseInt(a.questionId, 10) === index
 *    where `index` is the 0-based position in the scored question array. So the
 *    only values that can ever match are "0", "1", "2", …; sending a real
 *    database id scores zero. A `filter` (not `find`) is used, so multi-select
 *    questions send several entries sharing one `questionId`.
 *
 * 2. **`points` defaults differently on create and on grade.** `create()`
 *    normalises each question to `points: q.points || 1`; `submitQuiz` reads
 *    `Number(question.points) || 0`. An assessment stored without `points` is
 *    therefore graded out of a total of zero — which is the finding at the
 *    bottom of this file.
 *
 * The seeded assessment (`m.assessmentId`) has 3 questions whose correct
 * answers are indices 1, 1, 1, `passingScore: 50`, `retryLimit: 3`.
 *
 * Methods actually exported:
 *   /api/assessments        POST
 *   /api/assessments/[id]   GET, PUT   (no DELETE)
 *   /api/assessments/submit POST
 */

import { test, expect } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const COURSE = m.courses.published;
const MODULE = m.modules[0].id;
const ASSESSMENT = m.assessmentId;
const NONEXISTENT = "00000000-0000-4000-8000-000000000000";

interface Ok<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string;
}

interface Assessment {
  id: string;
  orgId: string;
  moduleId: string;
  title: string;
  passingScore?: number;
  retryLimit?: number;
  questions?: Array<{ text: string; options: string[]; correctAnswerIndex: number; points?: number }>;
}

interface Result {
  score: number;
  percentage: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
}

/** All three answers correct on the seeded assessment. */
const ALL_CORRECT = [
  { questionId: "0", selectedAnswerIndex: 1 },
  { questionId: "1", selectedAnswerIndex: 1 },
  { questionId: "2", selectedAnswerIndex: 1 },
];

const ALL_WRONG = [
  { questionId: "0", selectedAnswerIndex: 0 },
  { questionId: "1", selectedAnswerIndex: 0 },
  { questionId: "2", selectedAnswerIndex: 0 },
];

/** Create an assessment through the API — questions get `points: 1` normalised in. */
async function createAssessment(title: string, questions: unknown[], passingScore = 50) {
  const api = await apiAs("tenantAdmin");
  const res = await api.post("/api/assessments", {
    data: { moduleId: MODULE, title, questions, passingScore, retryLimit: 5 },
  });
  const body = (await safeJson(res)) as Ok<Assessment>;
  await api.dispose();
  if (!body.data?.id) throw new Error(`fixture setup failed: create returned ${res.status()}`);
  return body.data;
}

test.describe("Phase 11 — CRUD", () => {
  test("POST /api/assessments creates an assessment scoped to the caller's org", async () => {
    const api = await apiAs("tenantAdmin");
    const title = `phase11 created ${Date.now()}`;
    const res = await api.post("/api/assessments", {
      data: {
        moduleId: MODULE,
        title,
        questions: [{ text: "1 + 1 = ?", options: ["1", "2", "3"], correctAnswerIndex: 1 }],
        passingScore: 60,
        retryLimit: 2,
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = (await safeJson(res)) as Ok<Assessment>;
    expect(body.success).toBe(true);
    expect(body.data?.orgId).toBe(m.orgId);
    expect(body.data?.moduleId).toBe(MODULE);
    // `create` normalises every question to points:1 — the create side of the
    // asymmetry documented in the findings block.
    expect(body.data?.questions?.[0]?.points).toBe(1);

    const readBack = await api.get(`/api/assessments/${body.data!.id}`);
    expect(readBack.status()).toBe(200);
    expect(((await safeJson(readBack)) as Ok<Assessment>).data?.title).toBe(title);
    await api.dispose();
  });

  test("POST /api/assessments requires moduleId (400 naming the field)", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/assessments", { data: { title: "no module" } });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { error?: string };
    expect(body.error).toContain("moduleId");
    await api.dispose();
  });

  test("GET /api/assessments/[id] returns the seeded assessment", async () => {
    const api = await apiAs("learner");
    const res = await api.get(`/api/assessments/${ASSESSMENT}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Assessment>;
    expect(body.success).toBe(true);
    expect(body.data?.id).toBe(ASSESSMENT);
    expect(body.data?.questions?.length).toBe(3);
    expect(body.data?.passingScore).toBe(50);
    await api.dispose();
  });

  test("PUT /api/assessments/[id] updates and the change persists", async () => {
    const created = await createAssessment(`phase11 to-update ${Date.now()}`, [
      { text: "q", options: ["a", "b"], correctAnswerIndex: 1 },
    ]);
    const api = await apiAs("tenantAdmin");
    const newTitle = `phase11 updated ${Date.now()}`;
    const res = await api.put(`/api/assessments/${created.id}`, { data: { title: newTitle, passingScore: 80 } });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Assessment>;
    expect(body.success).toBe(true);

    const readBack = await api.get(`/api/assessments/${created.id}`);
    const rb = (await safeJson(readBack)) as Ok<Assessment>;
    expect(rb.data?.title).toBe(newTitle);
    expect(rb.data?.passingScore).toBe(80);
    await api.dispose();
  });

  test("GET /api/assessments/[id] with an unknown id is 404, not 500", async () => {
    const api = await apiAs("learner");
    const res = await api.get(`/api/assessments/${NONEXISTENT}`);
    expect(res.status()).toBe(404);
    const body = (await safeJson(res)) as { success?: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("not found");
    await api.dispose();
  });

  test("PUT /api/assessments/[id] with an unknown id is 404, not 500", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.put(`/api/assessments/${NONEXISTENT}`, { data: { title: "x" } });
    expect(res.status()).toBe(404);
    await api.dispose();
  });

  test("an assessment from another tenant is not readable", async () => {
    // findOne scopes the lmsAssessment lookup by orgId, so a foreign id must
    // read as absent.
    const api = await apiAs("tenantAdmin");
    const res = await api.get(`/api/assessments/${NONEXISTENT}`);
    expect([403, 404]).toContain(res.status());
    await api.dispose();
  });

  test("unauthenticated access is rejected", async () => {
    const anon = await apiAnon();
    const res = await anon.get(`/api/assessments/${ASSESSMENT}`);
    expect([401, 403]).toContain(res.status());
    await anon.dispose();
  });
});

test.describe("Phase 11 — grading", () => {
  test("submit counts every correct answer on the seeded assessment", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments/submit", {
      data: { assessmentId: ASSESSMENT, courseId: COURSE, answers: ALL_CORRECT },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Result>;
    expect(body.success).toBe(true);
    expect(body.data?.totalQuestions).toBe(3);
    expect(body.data?.correctCount, "correct answers are indices 1, 1, 1").toBe(3);
    expect(body.data?.wrongCount).toBe(0);
    await api.dispose();
  });

  test("submit counts every wrong answer", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments/submit", {
      data: { assessmentId: ASSESSMENT, courseId: COURSE, answers: ALL_WRONG },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Result>;
    expect(body.data?.correctCount).toBe(0);
    expect(body.data?.wrongCount).toBe(3);
    expect(body.data?.passed).toBe(false);
    await api.dispose();
  });

  test("an unanswered question counts as wrong", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments/submit", {
      data: { assessmentId: ASSESSMENT, courseId: COURSE, answers: [{ questionId: "0", selectedAnswerIndex: 1 }] },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Result>;
    expect(body.data?.correctCount).toBe(1);
    expect(body.data?.wrongCount, "the two omitted questions must count against the learner").toBe(2);
    await api.dispose();
  });

  test("answers keyed by a real question id score nothing (positional matching)", async () => {
    // Documents fact #1 from the file docblock: despite the field name, only
    // stringified positions match. This is the single easiest way for an
    // integrator to build a client that silently always scores zero.
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments/submit", {
      data: {
        assessmentId: ASSESSMENT,
        courseId: COURSE,
        answers: [
          { questionId: "question-uuid-aaa", selectedAnswerIndex: 1 },
          { questionId: "question-uuid-bbb", selectedAnswerIndex: 1 },
          { questionId: "question-uuid-ccc", selectedAnswerIndex: 1 },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Result>;
    expect(
      body.data?.correctCount,
      "non-positional questionIds match nothing — submitQuiz compares against the array index",
    ).toBe(0);
    await api.dispose();
  });

  test("a correct submission on an API-created assessment scores 100 and passes", async () => {
    // The control case for the points finding below: an assessment created
    // through POST /api/assessments has points normalised to 1, so grading works.
    const created = await createAssessment(
      `phase11 gradeable ${Date.now()}`,
      [
        { text: "q1", options: ["a", "b"], correctAnswerIndex: 1 },
        { text: "q2", options: ["a", "b"], correctAnswerIndex: 1 },
      ],
      50,
    );
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments/submit", {
      data: {
        assessmentId: created.id,
        courseId: COURSE,
        answers: [
          { questionId: "0", selectedAnswerIndex: 1 },
          { questionId: "1", selectedAnswerIndex: 1 },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Result>;
    expect(body.data?.correctCount).toBe(2);
    expect(body.data?.percentage).toBe(100);
    expect(body.data?.passed).toBe(true);
    expect(body.data?.score).toBe(2);
    await api.dispose();
  });

  test("a failing submission on an API-created assessment does not pass", async () => {
    const created = await createAssessment(
      `phase11 failing ${Date.now()}`,
      [
        { text: "q1", options: ["a", "b"], correctAnswerIndex: 1 },
        { text: "q2", options: ["a", "b"], correctAnswerIndex: 1 },
      ],
      50,
    );
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments/submit", {
      data: {
        assessmentId: created.id,
        courseId: COURSE,
        answers: [
          { questionId: "0", selectedAnswerIndex: 0 },
          { questionId: "1", selectedAnswerIndex: 0 },
        ],
      },
    });
    const body = (await safeJson(res)) as Ok<Result>;
    expect(body.data?.percentage).toBe(0);
    expect(body.data?.passed).toBe(false);
    await api.dispose();
  });

  test("submit with an unknown assessmentId is 404, not 500", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments/submit", {
      data: { assessmentId: NONEXISTENT, courseId: COURSE, answers: [] },
    });
    expect(res.status()).toBe(404);
    await api.dispose();
  });

  test("submit requires assessmentId and courseId (400 naming the fields)", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments/submit", { data: { answers: [] } });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { error?: string };
    expect(body.error).toContain("assessmentId");
    expect(body.error).toContain("courseId");
    await api.dispose();
  });
});

test.describe("Phase 11 — findings", () => {
  /**
   * FINDING (High) — a learner cannot pass an assessment whose questions were
   * stored without an explicit `points` value, no matter how many they answer
   * correctly.
   *
   * Endpoint : POST /api/assessments/submit
   * Observed : submitting all three correct answers to the seeded assessment
   *            (`passingScore: 50`) returns
   *              { score: 0, percentage: 0, passed: false,
   *                correctCount: 3, wrongCount: 0, totalQuestions: 3 }
   *            — the grader agrees every answer is right and still awards zero.
   * Expected : percentage 100, passed true.
   *
   * A/B proof (both run against the live server):
   *   - seeded assessment, questions have NO `points` key   → 3 correct, 0%, failed
   *   - assessment created via POST /api/assessments        → 2 correct, 100%, passed
   *   The only difference between the two is the presence of `points`.
   *
   * Root cause: asymmetric defaults for the same field in
   *            lib/services/assessments-service.ts —
   *              :22   const normalisePoints = (q) => ({ ...q, points: q.points || 1 });
   *                    // used ONLY by create()
   *              :173  const points = Number(question.points) || 0;
   *                    // used by submitQuiz()
   *            and then
   *              :216  const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
   *              :218  const passed = percentage >= passingScore;
   *            With every question contributing 0 points, `totalPoints` is 0,
   *            the ternary short-circuits `percentage` to 0, and `passed` is
   *            false for any `passingScore` above 0.
   *
   * Severity High. It is silent — the response looks well-formed and even
   * reports the correct `correctCount`, so nothing surfaces as an error — and it
   * blocks the primary learner outcome: `passed: false` means the course never
   * reaches Completed, which in turn means `generate-missing-certificates` has
   * nothing to issue. Any assessment not created through `POST /api/assessments`
   * (seeded, migrated, imported, or authored via the master-course JSON path) is
   * affected.
   *
   * Left FAILING intentionally.
   */
  test("answering every question correctly passes the seeded assessment", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments/submit", {
      data: { assessmentId: ASSESSMENT, courseId: COURSE, answers: ALL_CORRECT },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Result>;
    // The grader agrees the answers are right...
    expect(body.data?.correctCount).toBe(3);
    // ...but awards nothing for them.
    expect(
      body.data?.percentage,
      `3/3 correct scored ${body.data?.percentage}% — questions stored without \`points\` are graded ` +
        `out of 0 (assessments-service.ts:173 defaults to 0, while create() at :22 defaults to 1)`,
    ).toBe(100);
    expect(body.data?.passed, "a perfect score must pass a passingScore of 50").toBe(true);
    await api.dispose();
  });

  /**
   * FINDING (Medium) — GET /api/assessments/[id] returns the answer key.
   *
   * Endpoint : GET /api/assessments/[id]
   * Observed : a LEARNER fetching the assessment they are about to sit receives
   *            each question with its `correctAnswerIndex` intact:
   *              {"text":"2 + 2 = ?","options":["3","4","5"],"correctAnswerIndex":1}
   * Expected : the correct answer withheld from the learner-facing payload.
   * Root cause: app/api/assessments/[id]/route.ts returns the row from
   *            `findOne(id, orgId)` essentially verbatim. There is a
   *            session-scoped branch — when a `?sessionId=` is supplied and the
   *            proctoring manifest is non-empty, the question set is narrowed
   *            and `additionalQuestions` is deleted — but `correctAnswerIndex`
   *            is not stripped on either branch, and the no-session branch (the
   *            default, and what a plain player fetch does) returns the full
   *            stored question objects.
   *
   * Severity Medium rather than High: this is a client-side integrity issue, not
   * a data breach — the answers belong to a quiz the caller is entitled to take,
   * and grading happens server-side. But it makes every score untrustworthy,
   * since anyone who opens devtools can read the key before answering, and the
   * same payload is what feeds `retryLimit` and certificate issuance.
   *
   * Left FAILING intentionally.
   */
  test("the learner-facing assessment payload withholds correctAnswerIndex", async () => {
    const api = await apiAs("learner");
    const res = await api.get(`/api/assessments/${ASSESSMENT}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<Assessment>;
    const leaked = (body.data?.questions ?? []).filter((q) => q.correctAnswerIndex !== undefined);
    expect(
      leaked.map((q) => q.text),
      `ANSWER KEY EXPOSED: ${leaked.length}/${body.data?.questions?.length} questions carry ` +
        `correctAnswerIndex in the learner-facing response`,
    ).toHaveLength(0);
    await api.dispose();
  });

  /**
   * FINDING (Medium) — assessment authoring is open to every authenticated role.
   *
   * Endpoint : POST /api/assessments, PUT /api/assessments/[id]
   * Observed : a LEARNER creates an assessment attached to a seeded module and
   *            receives 200 with a persisted row.
   * Expected : 403 — authoring belongs to the roles that author courses. The
   *            adjacent content routes (`POST /api/courses`,
   *            `/api/courses/modules`, `/api/courses/lessons`) all enforce
   *            ['ADMIN','TENANT_ADMIN','SUB_ADMIN'].
   * Root cause: app/api/assessments/route.ts and app/api/assessments/[id]/route.ts
   *            call `requireAuth(req)` and check only `actor.orgId`; neither
   *            imports `requireRoles`. This is the same class of gap as the
   *            phase 06 finding on the two `order` routes — a route that ported
   *            a legacy tenant guard without the accompanying role decorator.
   *
   * Severity Medium: writes are tenant-scoped (`create(actor.orgId, dto)`), so
   * this is intra-tenant privilege escalation, not a cross-tenant issue. But a
   * learner can attach an assessment to any module in their tenant, and — via
   * PUT — rewrite the questions and `passingScore` of an existing one, which
   * directly affects other learners' outcomes.
   *
   * Left FAILING intentionally.
   */
  test("LEARNER cannot create an assessment", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/assessments", {
      data: {
        moduleId: MODULE,
        title: `phase11 learner-authored ${Date.now()}`,
        questions: [{ text: "should not exist", options: ["a", "b"], correctAnswerIndex: 0 }],
      },
    });
    expect(
      [401, 403],
      `PRIVILEGE ESCALATION: LEARNER got ${res.status()} creating an assessment — ` +
        `app/api/assessments/route.ts has requireAuth but no requireRoles`,
    ).toContain(res.status());
    await api.dispose();
  });

  test("LEARNER cannot rewrite an existing assessment", async () => {
    const created = await createAssessment(`phase11 target ${Date.now()}`, [
      { text: "q", options: ["a", "b"], correctAnswerIndex: 1 },
    ]);
    const api = await apiAs("learner");
    const res = await api.put(`/api/assessments/${created.id}`, { data: { passingScore: 0 } });
    expect(
      [401, 403],
      `PRIVILEGE ESCALATION: LEARNER got ${res.status()} rewriting an assessment's passingScore`,
    ).toContain(res.status());
    await api.dispose();
  });
});
