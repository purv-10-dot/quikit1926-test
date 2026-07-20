/**
 * PHASE 15 — Proctoring: 4 `/api/proctoring/*` + 9 `/api/quiz-proctoring/*`.
 *
 *   POST  /api/proctoring/[sessionId]/event          (LEARNER)
 *   GET   /api/proctoring/[sessionId]/log            (TENANT_ADMIN|SUB_ADMIN|TEACHER)
 *   PATCH /api/proctoring/[sessionId]/incident       (TENANT_ADMIN|SUB_ADMIN|TEACHER)
 *   GET   /api/proctoring/exam/[examId]/incidents    (TENANT_ADMIN|SUB_ADMIN|TEACHER)
 *
 *   POST  /api/quiz-proctoring/start                 (LEARNER)
 *   POST  /api/quiz-proctoring/[sessionId]/event     (LEARNER)
 *   POST  /api/quiz-proctoring/[sessionId]/complete  (LEARNER)
 *   GET   /api/quiz-proctoring/session/[assessmentId] (LEARNER)
 *   GET   /api/quiz-proctoring/[sessionId]/log       (TENANT_ADMIN|SUB_ADMIN|MANAGER)
 *   PATCH /api/quiz-proctoring/[sessionId]/incident  (TENANT_ADMIN|SUB_ADMIN|MANAGER)
 *   POST  /api/quiz-proctoring/[sessionId]/allow-retake (TENANT_ADMIN|SUB_ADMIN|MANAGER)
 *   GET   /api/quiz-proctoring/assessment/[assessmentId]/incidents (…|MANAGER)
 *   GET   /api/quiz-proctoring/incidents/all         (…|MANAGER)
 *
 * NOTE the role split: the exam side admits TEACHER and the quiz side admits
 * MANAGER instead. Each is asserted against the other's roles.
 *
 * The event endpoints are the sharp edge. `POST /proctoring/:sessionId/event`
 * is reachable by every learner and writes to a forensic table used in cheating
 * disputes, so "can learner B inflate learner A's flags" is the question that
 * matters — framing a classmate, not reading their data.
 *
 * The final describe carries the ANSWER-KEY check for the quiz take-path
 * (`GET /api/assessments/:id`), which is where a proctored learner fetches the
 * questions. Those tests currently FAIL; see the block comment there for the
 * verified root cause.
 */

import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest, mintSessionToken } from "../fixtures/auth";

const m = loadManifest();
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3020";
const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT15-${Date.now()}`;
const LEARNER_B_EMAIL = "e2e-learner-b@quiklms.test";

/** See phase14: dev-server cold compiles blow the 15s actionTimeout. */
const CEIL = 60_000;
const GET = (a: APIRequestContext, p: string) => a.get(p, { timeout: CEIL });
const POST = (a: APIRequestContext, p: string, data?: unknown) =>
  a.post(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const PATCH = (a: APIRequestContext, p: string, data: unknown) =>
  a.patch(p, { timeout: CEIL, data });
const PUT = (a: APIRequestContext, p: string, data: unknown) => a.put(p, { timeout: CEIL, data });

interface Envelope<T> {
  success?: boolean;
  data?: T;
  statusCode?: number;
  message?: string;
}

async function provisionLearnerB(): Promise<{ id: string; api: APIRequestContext }> {
  const admin = await apiAs("tenantAdmin");
  const res = await POST(admin, "/api/auth/register", {
    email: LEARNER_B_EMAIL,
    firstName: "E2E",
    lastName: "LearnerB",
    role: "LEARNER",
  });
  expect(res.status()).toBe(201);
  const id = ((await safeJson(res)) as Envelope<{ id: string }>).data!.id;
  await admin.dispose();
  const token = await mintSessionToken("learner", { id, sub: id, email: LEARNER_B_EMAIL });
  const api = await request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: `next-auth.session-token=${token}` },
  });
  return { id, api };
}

/** Publish an exam a learner can sit right now, and start their session. */
async function startExamSession(teacher: APIRequestContext, learner: APIRequestContext, label: string) {
  const qRes = await POST(teacher, "/api/question-bank", {
    subject: RUN,
    type: "mcq",
    difficulty: "easy",
    text: `${label} question`,
    options: [
      { text: "a", isCorrect: false },
      { text: "b", isCorrect: true },
    ],
    correctAnswer: "b",
    points: 5,
    tags: [RUN],
  });
  const questionId = ((await safeJson(qRes)) as Envelope<{ id: string }>).data!.id;

  const eRes = await POST(teacher, "/api/exams", {
    title: `${label} Exam`,
    subject: RUN,
    duration: 60,
    questions: [{ questionId, points: 5, order: 1 }],
    scheduledStartTime: new Date(Date.now() - 60_000).toISOString(),
    scheduledEndTime: new Date(Date.now() + 2 * 3600_000).toISOString(),
  });
  const examId = ((await safeJson(eRes)) as Envelope<{ id: string }>).data!.id;
  await POST(teacher, `/api/exams/${examId}/publish`);

  const sRes = await POST(learner, `/api/exam-sessions/${examId}/start`);
  expect(sRes.status(), "starting the proctored session").toBe(200);
  const sessionId = ((await safeJson(sRes)) as Envelope<{ sessionId: string }>).data!.sessionId;
  return { examId, sessionId };
}

/** A standalone assessment whose subset selection produces a real manifest. */
async function createAssessment(api: APIRequestContext, title: string, questionsToShow?: number) {
  const res = await POST(api, "/api/assessments", {
    moduleId: m.modules[0].id,
    title,
    passingScore: 50,
    randomizeQuestions: questionsToShow !== undefined,
    ...(questionsToShow !== undefined ? { questionsToShow } : {}),
    questions: [
      { text: `${title} Q1`, type: "multiple-choice", options: ["a", "b"], correctAnswerIndex: 1 },
      { text: `${title} Q2`, type: "multiple-choice", options: ["c", "d"], correctAnswerIndex: 0 },
      { text: `${title} Q3`, type: "multiple-choice", options: ["e", "f"], correctAnswerIndex: 1 },
    ],
  });
  expect(res.status(), "creating the assessment fixture").toBe(200);
  return ((await safeJson(res)) as Envelope<{ id: string }>).data!.id;
}

// ── Exam proctoring ──────────────────────────────────────────────────────────

test.describe("Phase 15 — exam proctoring", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let teacher: APIRequestContext;
  let learner: APIRequestContext;
  let examId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    teacher = await apiAs("teacher");
    learner = await apiAs("learner");
    ({ examId, sessionId } = await startExamSession(teacher, learner, `${RUN} Proctor`));
  });
  test.afterAll(async () => {
    await teacher.dispose();
    await learner.dispose();
  });

  test("a LEARNER can log a proctoring event on their own session", async () => {
    const res = await POST(learner, `/api/proctoring/${sessionId}/event`, {
      eventType: "tab_switch",
      metadata: { run: RUN },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{ severity: string }>;
    expect(["low", "medium", "high"]).toContain(body.data!.severity);
  });

  test("severity escalates with repeat offences", async () => {
    // proctoring-service.ts:60-63 — <3 low, >=3 medium, >=10 high.
    let last = "low";
    for (let i = 0; i < 4; i++) {
      const res = await POST(learner, `/api/proctoring/${sessionId}/event`, {
        eventType: "tab_switch",
      });
      last = ((await safeJson(res)) as Envelope<{ severity: string }>).data!.severity;
    }
    expect(last, "the 5th tab switch must not still be 'low'").toBe("medium");
  });

  test("print_attempt is high severity on the first occurrence", async () => {
    const res = await POST(learner, `/api/proctoring/${sessionId}/event`, {
      eventType: "print_attempt",
    });
    expect(((await safeJson(res)) as Envelope<{ severity: string }>).data!.severity).toBe("high");
  });

  test("staff can read the forensic log and it contains what the learner sent", async () => {
    const res = await GET(teacher, `/api/proctoring/${sessionId}/log`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<
      Array<{ eventType: string; severity: string; metadata: unknown; timestamp: string }>
    >;
    expect(body.data!.length).toBeGreaterThanOrEqual(6);
    expect(body.data!.some((l) => l.eventType === "print_attempt")).toBe(true);
    expect(body.data!.filter((l) => l.eventType === "tab_switch").length).toBeGreaterThanOrEqual(5);
    // Ordered ascending by timestamp (proctoring-service.ts:93).
    const times = body.data!.map((l) => new Date(l.timestamp).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  test("the exam incident report is generated from the flagged session", async () => {
    const res = await GET(teacher, `/api/proctoring/exam/${examId}/incidents`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<
      Array<{
        _id: string;
        sessionId: string;
        disposition: string;
        flagSummary: Record<string, number>;
        student: { email: string } | null;
        proctoringFlags: Record<string, unknown>;
      }>
    >;
    const inc = body.data!.find((i) => i.sessionId === sessionId);
    expect(inc, "a session with flags must produce an incident").toBeTruthy();
    expect(inc!.disposition).toBe("pending");
    expect(inc!.flagSummary.tab_switch).toBeGreaterThanOrEqual(5);
    expect(inc!.flagSummary.print_attempt).toBe(1);
    // `_id` and the populated student are restored deliberately — the incidents
    // page keys rows off `_id` and renders the student's name.
    expect(inc!._id).toBeTruthy();
    expect(inc!.student!.email).toBe(m.users.learner.email.toLowerCase());
    // Flags were aggregated atomically onto the session, not just logged.
    expect(inc!.proctoringFlags.totalFlags).toBeGreaterThanOrEqual(6);
    expect(inc!.proctoringFlags.tabSwitches).toBeGreaterThanOrEqual(5);
  });

  test("reviewing an incident persists the disposition and the read-back proves it", async () => {
    const res = await PATCH(teacher, `/api/proctoring/${sessionId}/incident`, {
      disposition: "dismissed",
      action: "warning",
      remarks: `${RUN} reviewed`,
    });
    expect(res.status()).toBe(200);

    const read = (await safeJson(
      await GET(teacher, `/api/proctoring/exam/${examId}/incidents`),
    )) as Envelope<
      Array<{ sessionId: string; disposition: string; action: string; remarks: string; reviewedBy: string }>
    >;
    const inc = read.data!.find((i) => i.sessionId === sessionId)!;
    expect(inc.disposition).toBe("dismissed");
    expect(inc.action).toBe("warning");
    expect(inc.remarks).toBe(`${RUN} reviewed`);
    expect(inc.reviewedBy).toBe(m.users.teacher.lmsUserId);
  });

  test("an unknown disposition is rejected by zod, not persisted as garbage", async () => {
    // The enum guard exists precisely because this table is used in cheating
    // disputes (app/api/proctoring/[sessionId]/incident/route.ts:8-16).
    const res = await PATCH(teacher, `/api/proctoring/${sessionId}/incident`, {
      disposition: "definitely_guilty",
      action: "warning",
    });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { validationErrors?: Array<{ field: string }> };
    expect(body.validationErrors!.some((v) => v.field === "disposition")).toBe(true);
  });

  test("reviewing with session_voided actually voids the session", async () => {
    const res = await PATCH(teacher, `/api/proctoring/${sessionId}/incident`, {
      disposition: "confirmed_violation",
      action: "session_voided",
      remarks: `${RUN} voided`,
    });
    expect(res.status()).toBe(200);

    const subs = (await safeJson(
      await GET(teacher, `/api/exam-sessions/exam/${examId}/submissions`),
    )) as Envelope<Array<{ _id: string; status: string }>>;
    expect(subs.data!.find((s) => s._id === sessionId)!.status).toBe("voided");
  });
});

test.describe("Phase 15 — exam proctoring: event injection", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let teacher: APIRequestContext;
  let learnerA: APIRequestContext;
  let learnerB: APIRequestContext;
  let sessionA: string;
  let examId: string;

  test.beforeAll(async () => {
    teacher = await apiAs("teacher");
    learnerA = await apiAs("learner");
    ({ examId, sessionId: sessionA } = await startExamSession(teacher, learnerA, `${RUN} Inject`));
    ({ api: learnerB } = await provisionLearnerB());
  });
  test.afterAll(async () => {
    await teacher.dispose();
    await learnerA.dispose();
    await learnerB?.dispose();
  });

  test("learner B cannot log proctoring events against learner A's session", async () => {
    // The ownership check (`{id, orgId, studentId}`,
    // lib/services/proctoring-service.ts:47-51) is what stops one learner
    // inflating a classmate's cheating flags and getting their exam voided.
    const res = await POST(learnerB, `/api/proctoring/${sessionA}/event`, {
      eventType: "print_attempt",
    });
    expect(res.status(), "FRAMING VECTOR: B wrote to A's proctoring record").toBe(404);
  });

  test("learner A's flag record is untouched by the injection attempt", async () => {
    const res = await GET(teacher, `/api/proctoring/${sessionA}/log`);
    const body = (await safeJson(res)) as Envelope<Array<{ eventType: string }>>;
    expect(
      body.data!.some((l) => l.eventType === "print_attempt"),
      "the injected event was persisted anyway",
    ).toBe(false);
  });

  test("a nonexistent session id yields 404 on event, not 500", async () => {
    const res = await POST(learnerA, `/api/proctoring/${MISSING}/event`, { eventType: "blur" });
    expect(res.status()).toBe(404);
  });

  test("reviewing an incident that does not exist yields 404", async () => {
    const res = await PATCH(teacher, `/api/proctoring/${MISSING}/incident`, {
      disposition: "dismissed",
      action: "none",
    });
    expect(res.status()).toBe(404);
  });

  test("an exam with no flagged sessions returns an empty incident list", async () => {
    const res = await GET(teacher, `/api/proctoring/exam/${MISSING}/incidents`);
    expect(res.status()).toBe(200);
    expect(((await safeJson(res)) as Envelope<unknown[]>).data).toEqual([]);
    // Referenced so the fixture exam id is not an unused binding.
    expect(examId).toBeTruthy();
  });
});

test.describe("Phase 15 — exam proctoring RBAC", () => {
  test.setTimeout(120_000);

  for (const role of ["teacher", "tenantAdmin", "manager", "parent"] as const) {
    test(`${role} cannot post a proctoring event (LEARNER only)`, async () => {
      const api = await apiAs(role);
      const res = await POST(api, `/api/proctoring/${MISSING}/event`, { eventType: "blur" });
      expect(res.status()).toBe(403);
      await api.dispose();
    });
  }

  for (const role of ["learner", "parent", "manager"] as const) {
    test(`${role} cannot read proctoring logs or incidents`, async () => {
      const api = await apiAs(role);
      // MANAGER is deliberately in this list: the EXAM side admits
      // TENANT_ADMIN|SUB_ADMIN|TEACHER only, unlike the quiz side.
      expect((await GET(api, `/api/proctoring/${MISSING}/log`)).status()).toBe(403);
      expect((await GET(api, `/api/proctoring/exam/${MISSING}/incidents`)).status()).toBe(403);
      expect(
        (await PATCH(api, `/api/proctoring/${MISSING}/incident`, {
          disposition: "dismissed",
          action: "none",
        })).status(),
      ).toBe(403);
      await api.dispose();
    });
  }

  test("unauthenticated proctoring access is rejected", async () => {
    const anon = await apiAnon();
    expect([401, 403]).toContain((await GET(anon, `/api/proctoring/${MISSING}/log`)).status());
    expect([401, 403]).toContain(
      (await POST(anon, `/api/proctoring/${MISSING}/event`, { eventType: "blur" })).status(),
    );
    await anon.dispose();
  });
});

// ── Quiz proctoring ──────────────────────────────────────────────────────────

test.describe("Phase 15 — quiz proctoring lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let manager: APIRequestContext;
  let learner: APIRequestContext;
  let assessmentId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    admin = await apiAs("tenantAdmin");
    manager = await apiAs("manager");
    learner = await apiAs("learner");
    assessmentId = await createAssessment(admin, `${RUN} Quiz`, 2);
  });
  test.afterAll(async () => {
    await admin.dispose();
    await manager.dispose();
    await learner.dispose();
  });

  test("start locks in a question subset and returns a manifest", async () => {
    const res = await POST(learner, "/api/quiz-proctoring/start", {
      assessmentId,
      courseId: m.courses.published,
      timeLimitMinutes: 30,
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{
      sessionId: string;
      status: string;
      selectedQuestionIndices: number[];
      questionManifest: Array<{ pool: string; index: number }>;
      remainingSeconds: number;
    }>;
    sessionId = body.data!.sessionId;
    expect(sessionId).toBeTruthy();
    expect(body.data!.status).toBe("in_progress");
    expect(body.data!.remainingSeconds).toBeGreaterThan(0);
    // questionsToShow=2 of 3 → exactly two locked in.
    expect(body.data!.questionManifest).toHaveLength(2);
    expect(body.data!.selectedQuestionIndices).toHaveLength(2);
  });

  test("a mid-attempt reconnect resumes the SAME subset", async () => {
    const first = sessionId;
    const res = await POST(learner, "/api/quiz-proctoring/start", {
      assessmentId,
      courseId: m.courses.published,
      timeLimitMinutes: 30,
    });
    const body = (await safeJson(res)) as Envelope<{ sessionId: string }>;
    expect(body.data!.sessionId, "a reconnect must not re-roll the questions").toBe(first);
  });

  test("the learner can read their own session by assessment id", async () => {
    const res = await GET(learner, `/api/quiz-proctoring/session/${assessmentId}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{ id: string; learnerId: string; status: string }>;
    expect(body.data!.id).toBe(sessionId);
    expect(body.data!.learnerId).toBe(m.users.learner.lmsUserId);
    expect(body.data!.status).toBe("in_progress");
  });

  test("quiz proctoring events are logged with escalating severity", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await POST(learner, `/api/quiz-proctoring/${sessionId}/event`, {
        eventType: "tab_switch",
        metadata: { run: RUN },
      });
      expect(res.status()).toBe(200);
    }
    // face_multiple is high on sight (quiz-proctoring-service.ts:432).
    const face = await POST(learner, `/api/quiz-proctoring/${sessionId}/event`, {
      eventType: "face_multiple",
    });
    expect(((await safeJson(face)) as Envelope<{ severity: string }>).data!.severity).toBe("high");
  });

  test("an admin can read the quiz proctoring log", async () => {
    const res = await GET(admin, `/api/quiz-proctoring/${sessionId}/log`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<Array<{ eventType: string }>>;
    expect(body.data!.length).toBeGreaterThanOrEqual(5);
    expect(body.data!.some((l) => l.eventType === "face_multiple")).toBe(true);
  });

  test("the assessment incident list is generated for a MANAGER", async () => {
    const res = await GET(manager, `/api/quiz-proctoring/assessment/${assessmentId}/incidents`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<
      Array<{
        _id: string;
        sessionId: string;
        flagSummary: Record<string, number>;
        learner: { email: string } | null;
      }>
    >;
    const inc = body.data!.find((i) => i.sessionId === sessionId);
    expect(inc).toBeTruthy();
    expect(inc!._id).toBeTruthy();
    expect(inc!.flagSummary.tab_switch).toBe(4);
    expect(inc!.flagSummary.face_multiple).toBe(1);
    expect(inc!.learner!.email).toBe(m.users.learner.email.toLowerCase());
  });

  test("/incidents/all includes the same incident", async () => {
    const res = await GET(admin, "/api/quiz-proctoring/incidents/all");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<Array<{ sessionId: string }>>;
    expect(body.data!.some((i) => i.sessionId === sessionId)).toBe(true);
  });

  test("allow-retake is refused while the session is not voided", async () => {
    const res = await POST(admin, `/api/quiz-proctoring/${sessionId}/allow-retake`);
    expect(res.status(), "quiz-proctoring-service.ts:allowRetake status guard").toBe(400);
  });

  test("a confirmed violation with session_voided voids the session", async () => {
    const res = await PATCH(manager, `/api/quiz-proctoring/${sessionId}/incident`, {
      disposition: "confirmed_violation",
      action: "session_voided",
      remarks: `${RUN} voided`,
    });
    expect(res.status()).toBe(200);

    const read = (await safeJson(
      await GET(learner, `/api/quiz-proctoring/session/${assessmentId}`),
    )) as Envelope<{ status: string }>;
    expect(read.data!.status).toBe("voided");
  });

  test("a voided learner cannot start the quiz again", async () => {
    const res = await POST(learner, "/api/quiz-proctoring/start", {
      assessmentId,
      courseId: m.courses.published,
      timeLimitMinutes: 30,
    });
    expect(res.status()).toBe(400);
    expect(((await safeJson(res)) as Envelope<never>).message).toContain("voided");
  });

  test("allow-retake reopens the attempt AND preserves the forensic trail", async () => {
    const res = await POST(admin, `/api/quiz-proctoring/${sessionId}/allow-retake`);
    expect(res.status()).toBe(200);

    const session = (await safeJson(
      await GET(learner, `/api/quiz-proctoring/session/${assessmentId}`),
    )) as Envelope<{ status: string }>;
    // Flipped rather than deleted: under Postgres the logs and the reviewed
    // incident both cascade off the session row, so a delete would destroy the
    // record of WHY it was voided at the moment an admin overrides it.
    expect(session.data!.status).toBe("auto_submitted");

    const log = (await safeJson(
      await GET(admin, `/api/quiz-proctoring/${sessionId}/log`),
    )) as Envelope<unknown[]>;
    expect(log.data!.length, "AUDIT LOSS: allow-retake destroyed the proctoring log").toBeGreaterThanOrEqual(5);

    const incidents = (await safeJson(
      await GET(admin, `/api/quiz-proctoring/assessment/${assessmentId}/incidents`),
    )) as Envelope<Array<{ sessionId: string; remarks: string }>>;
    const inc = incidents.data!.find((i) => i.sessionId === sessionId);
    expect(inc, "AUDIT LOSS: the reviewed incident was destroyed").toBeTruthy();
    expect(inc!.remarks).toBe(`${RUN} voided`);
  });

  test("the retake actually starts and re-rolls a fresh subset", async () => {
    const res = await POST(learner, "/api/quiz-proctoring/start", {
      assessmentId,
      courseId: m.courses.published,
      timeLimitMinutes: 30,
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{
      status: string;
      questionManifest: unknown[];
      proctoringFlags: Record<string, number>;
    }>;
    expect(body.data!.status).toBe("in_progress");
    expect(body.data!.questionManifest).toHaveLength(2);
    expect(body.data!.proctoringFlags.totalFlags, "a retake starts from clean flags").toBe(0);
  });

  test("complete closes the learner's own session", async () => {
    const res = await POST(learner, `/api/quiz-proctoring/${sessionId}/complete`);
    expect(res.status()).toBe(200);
    const read = (await safeJson(
      await GET(learner, `/api/quiz-proctoring/session/${assessmentId}`),
    )) as Envelope<{ status: string }>;
    expect(read.data!.status).toBe("submitted");
  });
});

test.describe("Phase 15 — quiz proctoring guards", () => {
  test.setTimeout(120_000);

  // The quiz side admits MANAGER and excludes TEACHER — the mirror image of the
  // exam side. Getting these backwards is exactly the kind of drift this asserts.
  for (const role of ["teacher", "learner", "parent"] as const) {
    test(`${role} cannot review quiz incidents or allow a retake`, async () => {
      const api = await apiAs(role);
      expect((await GET(api, "/api/quiz-proctoring/incidents/all")).status()).toBe(403);
      expect(
        (await GET(api, `/api/quiz-proctoring/assessment/${MISSING}/incidents`)).status(),
      ).toBe(403);
      expect((await GET(api, `/api/quiz-proctoring/${MISSING}/log`)).status()).toBe(403);
      expect((await POST(api, `/api/quiz-proctoring/${MISSING}/allow-retake`)).status()).toBe(403);
      await api.dispose();
    });
  }

  for (const role of ["teacher", "manager", "tenantAdmin"] as const) {
    test(`${role} cannot start or drive a learner quiz session`, async () => {
      const api = await apiAs(role);
      expect(
        (await POST(api, "/api/quiz-proctoring/start", {
          assessmentId: m.assessmentId,
          courseId: m.courses.published,
        })).status(),
      ).toBe(403);
      expect(
        (await POST(api, `/api/quiz-proctoring/${MISSING}/event`, { eventType: "blur" })).status(),
      ).toBe(403);
      expect((await POST(api, `/api/quiz-proctoring/${MISSING}/complete`)).status()).toBe(403);
      expect((await GET(api, `/api/quiz-proctoring/session/${MISSING}`)).status()).toBe(403);
      await api.dispose();
    });
  }

  test("allow-retake on a nonexistent session yields 404", async () => {
    const admin = await apiAs("tenantAdmin");
    expect((await POST(admin, `/api/quiz-proctoring/${MISSING}/allow-retake`)).status()).toBe(404);
    await admin.dispose();
  });

  test("reviewing a nonexistent quiz incident yields 404", async () => {
    const admin = await apiAs("tenantAdmin");
    const res = await PATCH(admin, `/api/quiz-proctoring/${MISSING}/incident`, {
      disposition: "dismissed",
      action: "none",
    });
    expect(res.status()).toBe(404);
    await admin.dispose();
  });

  test("quiz start rejects a payload missing assessmentId/courseId", async () => {
    const learner = await apiAs("learner");
    const res = await POST(learner, "/api/quiz-proctoring/start", {});
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { validationErrors?: Array<{ field: string }> };
    expect(body.validationErrors!.map((v) => v.field)).toEqual(
      expect.arrayContaining(["assessmentId", "courseId"]),
    );
    await learner.dispose();
  });

  test("[informational] events for a session the caller does not own are silently dropped", async () => {
    // quiz-proctoring-service.ts:logEvent returns `{severity:'low'}` and writes
    // nothing when the session is not the caller's, rather than 404ing like the
    // exam-side equivalent. Not a leak — nothing is written and nothing is read
    // back — but the client cannot tell a dropped event from a recorded one.
    const learner = await apiAs("learner");
    const res = await POST(learner, `/api/quiz-proctoring/${MISSING}/event`, {
      eventType: "tab_switch",
    });
    console.log(
      `[INFO] quiz-proctoring event on an unowned session → HTTP ${res.status()} ${await res.text()}`,
    );
    expect([200, 404]).toContain(res.status());
    await learner.dispose();
  });

  test("unauthenticated quiz-proctoring access is rejected", async () => {
    const anon = await apiAnon();
    expect([401, 403]).toContain((await GET(anon, "/api/quiz-proctoring/incidents/all")).status());
    expect([401, 403]).toContain(
      (await POST(anon, "/api/quiz-proctoring/start", { assessmentId: "x", courseId: "y" })).status(),
    );
    await anon.dispose();
  });
});

// ── THE QUIZ TAKE-PATH ANSWER KEY ────────────────────────────────────────────

/**
 * FAILING BY DESIGN — verified product defects, not test bugs.
 *
 * `GET /api/assessments/:id` is the endpoint a learner calls to render a quiz.
 * Unlike the exam equivalent, it never strips the answer key:
 *
 *   - lib/services/assessments-service.ts:48-51 `findOne()` returns the raw
 *     Prisma row, `correctAnswerIndex` and all. There is no counterpart to
 *     `exams-service.ts:196-233 stripAnswerKey()` on this path.
 *   - app/api/assessments/[id]/route.ts:26-56 — the `sessionId` branch SLICES
 *     the question list to the proctoring manifest and deletes
 *     `additionalQuestions`, but never redacts the questions it does return.
 *     So even the proctored take-the-quiz request ships the key for every
 *     question shown.
 *   - With no `sessionId` at all the handler returns the row untouched
 *     (route.ts:55), so a learner needs only to omit the parameter to get the
 *     full key for every question in the pool.
 *
 * Reproduced by hand against the running server:
 *   GET /api/assessments/<id>            → HTTP 200, every question carries
 *                                          "correctAnswerIndex"
 *   GET /api/assessments/<id>?sessionId= → HTTP 200, the sliced question still
 *                                          carries "correctAnswerIndex"
 *
 * `__tests__/api/assessments-redaction.test.ts` locks in the SLICING contract
 * and its "no-session branch returns the full assessment" case, so the unit
 * suite is green while the wire leaks — which is precisely why this is checked
 * over HTTP.
 *
 * Severity: Critical. Any learner can read the answers to any quiz in their
 * tenant before or during the attempt, with a single authenticated GET.
 */
test.describe("Phase 15 — assessment answer-key leakage (quiz take-path)", () => {
  // NOT `serial`: these are four INDEPENDENT findings. Under serial mode the
  // first failure would skip the rest and the report would understate the
  // problem by three quarters. Tests in one file still run in order in a single
  // worker, so the shared fixture below is unaffected.
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let learner: APIRequestContext;
  let plainAssessmentId: string;
  let subsetAssessmentId: string;
  let quizSessionId: string;

  test.beforeAll(async () => {
    admin = await apiAs("tenantAdmin");
    learner = await apiAs("learner");
    plainAssessmentId = await createAssessment(admin, `${RUN} KeyPlain`);
    subsetAssessmentId = await createAssessment(admin, `${RUN} KeySubset`, 1);

    const res = await POST(learner, "/api/quiz-proctoring/start", {
      assessmentId: subsetAssessmentId,
      courseId: m.courses.published,
      timeLimitMinutes: 30,
    });
    quizSessionId = ((await safeJson(res)) as Envelope<{ sessionId: string }>).data!.sessionId;
  });
  test.afterAll(async () => {
    await admin.dispose();
    await learner.dispose();
  });

  test("a LEARNER fetching a quiz must not receive correctAnswerIndex", async () => {
    const res = await GET(learner, `/api/assessments/${plainAssessmentId}`);
    expect(res.status()).toBe(200);
    const raw = await res.text();
    expect(
      raw,
      "ANSWER-KEY LEAK: GET /api/assessments/:id returns correctAnswerIndex to a LEARNER. " +
        "Root cause: lib/services/assessments-service.ts:48-51 returns the raw row and " +
        "app/api/assessments/[id]/route.ts:55 ships it verbatim — there is no equivalent of " +
        "exams-service.ts:196-233 stripAnswerKey() on this path.",
    ).not.toContain("correctAnswerIndex");
  });

  test("the PROCTORED take-path must not receive the key either", async () => {
    const res = await GET(learner, `/api/assessments/${subsetAssessmentId}?sessionId=${quizSessionId}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Envelope<{
      questions: Array<Record<string, unknown>>;
      additionalQuestions?: unknown;
    }>;

    // The slicing half of the contract DOES work — questionsToShow=1 of 3.
    expect(body.data!.questions).toHaveLength(1);
    expect(body.data, "the raw bonus pool must not reach the wire").not.toHaveProperty(
      "additionalQuestions",
    );

    // …but the question it returns still names the right answer.
    expect(
      body.data!.questions[0],
      "ANSWER-KEY LEAK: the manifest branch (app/api/assessments/[id]/route.ts:31-54) " +
        "slices the question list but never redacts it, so a proctored learner is handed " +
        "the answer to the very question they are being asked.",
    ).not.toHaveProperty("correctAnswerIndex");
  });

  test("a LEARNER must not be able to CREATE an assessment", async () => {
    // app/api/assessments/route.ts:8-9 — `requireAuth` with NO `requireRoles`,
    // so any authenticated role reaches the quiz-authoring endpoint. Verified
    // live: a learner-minted session created assessment
    // 8c5b2b26-c42f-41bf-8d17-e98064e20f46 and got HTTP 200.
    const res = await POST(learner, "/api/assessments", {
      moduleId: m.modules[0].id,
      title: `${RUN} learner-authored`,
      questions: [
        { text: "learner wrote this", type: "multiple-choice", options: ["a", "b"], correctAnswerIndex: 0 },
      ],
    });
    expect(
      res.status(),
      "MISSING ROLE GUARD: POST /api/assessments admits every authenticated role " +
        "(app/api/assessments/route.ts:8-9 calls requireAuth with no requireRoles).",
    ).toBe(403);
  });

  test("a LEARNER must not be able to EDIT an assessment", async () => {
    // app/api/assessments/[id]/route.ts:59-60 — same omission on PUT. A learner
    // can rewrite `correctAnswerIndex` on the quiz they are about to sit.
    const res = await PUT(learner, `/api/assessments/${plainAssessmentId}`, {
      title: `${RUN} learner-edited`,
      passingScore: 0,
    });
    expect(
      res.status(),
      "MISSING ROLE GUARD: PUT /api/assessments/:id admits every authenticated role " +
        "(app/api/assessments/[id]/route.ts:59-60), letting a learner rewrite the quiz " +
        "— including its answer key and passing score.",
    ).toBe(403);
  });
});
