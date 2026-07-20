/**
 * PHASE 18 — Homework (`/api/homework/*`), all 10 routes.
 *
 *   POST                /api/homework                        (TEACHER|TENANT_ADMIN|SUB_ADMIN)
 *   GET|PATCH|DELETE    /api/homework/[id]                   (GET: any authed)
 *   PATCH               /api/homework/[id]/publish           (staff)
 *   PATCH               /api/homework/[id]/close             (staff)
 *   POST                /api/homework/[id]/submit            (LEARNER)
 *   GET                 /api/homework/[id]/submissions       (staff)
 *   GET                 /api/homework/[id]/stats             (staff)
 *   PATCH               /api/homework/submissions/[id]/grade (staff)
 *   GET                 /api/homework/teacher                (staff)
 *   GET                 /api/homework/student/submissions    (LEARNER|PARENT)
 *
 * Like the gradebook, these routes answer with a BARE payload rather than
 * `{success:true,data}` (they do `json(await service(...))`), so the assertions
 * read the object directly.
 *
 * Security angles specific to this domain:
 *  - a learner must not be able to grade themselves by posting `score` to
 *    `/submit` (the zod schema is `{attachmentUrls?, textResponse?}` only);
 *  - `DELETE /api/homework/:id` cascades to every submission under Postgres, so
 *    the service REFUSES to delete once work exists (homework-service.ts:
 *    202-222) — a guard worth pinning down, since the endpoint is open to any
 *    TEACHER;
 *  - `/student/submissions` lets a PARENT name any `studentId` they like.
 */

import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest, mintSessionToken } from "../fixtures/auth";

const m = loadManifest();
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3020";
const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT18-${Date.now()}`;
const LEARNER_B_EMAIL = "e2e-learner-b@quiklms.test";

/** See phase14: dev-server cold compiles blow the 15s actionTimeout. */
const CEIL = 60_000;
const GET = (a: APIRequestContext, p: string) => a.get(p, { timeout: CEIL });
const POST = (a: APIRequestContext, p: string, data?: unknown) =>
  a.post(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const PATCH = (a: APIRequestContext, p: string, data?: unknown) =>
  a.patch(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const DELETE = (a: APIRequestContext, p: string) => a.delete(p, { timeout: CEIL });

interface Envelope<T> {
  success?: boolean;
  data?: T;
  statusCode?: number;
  message?: string;
}
interface Homework {
  id: string;
  title: string;
  status: string;
  maxScore: number | null;
  dueDate: string;
  batchId: { id: string; name: string } | string;
  teacherId: { id: string } | string;
  allowLateSubmission: boolean;
  type: string | null;
}
interface Submission {
  id: string;
  homeworkId: string | Record<string, unknown>;
  studentId: string | { id: string; email: string };
  status: string;
  score: number | null;
  finalScore: number | null;
  feedback: string | null;
  textResponse: string | null;
  isLate: boolean;
  gradedBy: string | { id: string } | null;
  rubricScores: Array<{ criterion: string; score: number; maxScore: number }>;
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

/** A published homework on the seeded batch. `create` publishes immediately. */
async function createHomework(
  teacher: APIRequestContext,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<Homework> {
  const res = await POST(teacher, "/api/homework", {
    title,
    description: `${RUN} description`,
    instructions: `${RUN} instructions`,
    batchId: m.batchId,
    dueDate: new Date(Date.now() + 864e5).toISOString(),
    maxScore: 100,
    type: "assignment",
    ...extra,
  });
  expect(res.status(), `homework create said ${await res.text()}`).toBe(200);
  return (await safeJson(res)) as Homework;
}

test.beforeAll(() => {
  // Every fixture here hangs off the seeded batch.
  expect(m.batchId, "seed manifest has no batchId — reseed before running").toBeTruthy();
});

// ── The full teacher → learner → grader lifecycle ────────────────────────────

test.describe("Phase 18 — homework lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let teacher: APIRequestContext;
  let learner: APIRequestContext;
  let homeworkId: string;
  let submissionId: string;

  test.beforeAll(async () => {
    teacher = await apiAs("teacher");
    learner = await apiAs("learner");
  });
  test.afterAll(async () => {
    await teacher.dispose();
    await learner.dispose();
  });

  test("POST creates a homework that is published immediately", async () => {
    const hw = await createHomework(teacher, `${RUN} Lifecycle`);
    homeworkId = hw.id;
    expect(homeworkId).toBeTruthy();
    // `create` sets `status:'published'` + `publishedAt` up front
    // (homework-service.ts:128-129) — there is no draft state on this path.
    expect(hw.status).toBe("published");
    expect(hw.maxScore).toBe(100);
    // NOTE: HTTP 200, not the 201 that CLAUDE.md prescribes for a creation.
    // Recorded in the [informational] test below rather than asserted here.
  });

  test("GET by id returns the homework with batch and teacher populated", async () => {
    const res = await GET(teacher, `/api/homework/${homeworkId}`);
    expect(res.status()).toBe(200);
    const hw = (await safeJson(res)) as Homework;
    expect(hw.title).toBe(`${RUN} Lifecycle`);
    // `.populate()` parity — batchId/teacherId are the documents, not uuids.
    expect(typeof hw.batchId).toBe("object");
    expect((hw.batchId as { name: string }).name).toBe("E2E Batch A");
    expect(typeof hw.teacherId).toBe("object");
    expect((hw.teacherId as { id: string }).id).toBe(m.users.teacher.lmsUserId);
  });

  test("PATCH edits the homework and the read-back reflects it", async () => {
    const res = await PATCH(teacher, `/api/homework/${homeworkId}`, {
      title: `${RUN} Lifecycle EDITED`,
      instructions: "Show your working.",
      maxScore: 50,
    });
    expect(res.status()).toBe(200);

    const hw = (await safeJson(await GET(teacher, `/api/homework/${homeworkId}`))) as Homework & {
      instructions: string;
    };
    expect(hw.title).toBe(`${RUN} Lifecycle EDITED`);
    expect(hw.instructions).toBe("Show your working.");
    expect(hw.maxScore).toBe(50);
  });

  test("publish is idempotent on an already-published homework", async () => {
    const res = await PATCH(teacher, `/api/homework/${homeworkId}/publish`);
    expect(res.status()).toBe(200);
    expect(((await safeJson(res)) as Homework).status).toBe("published");
  });

  test("the homework appears in the teacher's list", async () => {
    const res = await GET(teacher, "/api/homework/teacher");
    expect(res.status()).toBe(200);
    const rows = (await safeJson(res)) as Homework[];
    expect(rows.some((h) => h.id === homeworkId)).toBe(true);

    const filtered = (await safeJson(
      await GET(teacher, `/api/homework/teacher?batchId=${m.batchId}&status=published`),
    )) as Homework[];
    expect(filtered.some((h) => h.id === homeworkId)).toBe(true);
  });

  test("a LEARNER submits, and an injected score/status is IGNORED", async () => {
    const res = await POST(learner, `/api/homework/${homeworkId}/submit`, {
      textResponse: `${RUN} my answer`,
      // Self-grading attempt: none of these are in the route's zod schema
      // (app/api/homework/[id]/submit/route.ts:7-10).
      score: 100,
      finalScore: 100,
      status: "graded",
      gradedBy: m.users.teacher.lmsUserId,
    });
    expect(res.status()).toBe(200);
    const sub = (await safeJson(res)) as Submission;
    submissionId = sub.id;
    expect(sub.textResponse).toBe(`${RUN} my answer`);
    expect(sub.status, "an injected status must not stick").toBe("submitted");
    expect(sub.score, "a learner must not be able to set their own score").toBeNull();
    expect(sub.finalScore).toBeNull();
    expect(sub.gradedBy).toBeNull();
    expect(sub.isLate).toBe(false);
  });

  test("a second submission by the same learner is refused", async () => {
    const res = await POST(learner, `/api/homework/${homeworkId}/submit`, {
      textResponse: "second go",
    });
    expect(res.status(), "homework-service.ts:229 — one submission per student").toBe(400);
  });

  test("the teacher sees the submission with the student populated", async () => {
    const res = await GET(teacher, `/api/homework/${homeworkId}/submissions`);
    expect(res.status()).toBe(200);
    const rows = (await safeJson(res)) as Submission[];
    const row = rows.find((s) => s.id === submissionId);
    expect(row).toBeTruthy();
    expect((row!.studentId as { email: string }).email).toBe(m.users.learner.email.toLowerCase());
  });

  test("grading persists score, feedback and rubric, and the read-back proves it", async () => {
    const res = await PATCH(teacher, `/api/homework/submissions/${submissionId}/grade`, {
      score: 42,
      feedback: `${RUN} good effort`,
      rubricScores: [
        { criterion: "Accuracy", maxScore: 30, score: 20 },
        { criterion: "Presentation", maxScore: 20, score: 22 },
      ],
    });
    expect(res.status()).toBe(200);

    const rows = (await safeJson(
      await GET(teacher, `/api/homework/${homeworkId}/submissions`),
    )) as Submission[];
    const row = rows.find((s) => s.id === submissionId)!;
    expect(row.status).toBe("graded");
    expect(row.score).toBe(42);
    // Not late, so no penalty: finalScore tracks score.
    expect(row.finalScore).toBe(42);
    expect(row.feedback).toBe(`${RUN} good effort`);
    expect(row.rubricScores).toHaveLength(2);
    expect(row.rubricScores.map((r) => r.criterion).sort()).toEqual(["Accuracy", "Presentation"]);
  });

  test("re-grading REPLACES the rubric rather than appending to it", async () => {
    // `rubricScores: { deleteMany: {}, create: [...] }` (homework-service.ts:
    // 279-287) — a second grade pass must not double the rows.
    const res = await PATCH(teacher, `/api/homework/submissions/${submissionId}/grade`, {
      score: 45,
      rubricScores: [{ criterion: "Accuracy", maxScore: 30, score: 30 }],
    });
    expect(res.status()).toBe(200);

    const rows = (await safeJson(
      await GET(teacher, `/api/homework/${homeworkId}/submissions`),
    )) as Submission[];
    const row = rows.find((s) => s.id === submissionId)!;
    expect(row.score).toBe(45);
    expect(row.rubricScores, "the previous rubric rows were not cleared").toHaveLength(1);
  });

  test("stats reflect the graded submission", async () => {
    const res = await GET(teacher, `/api/homework/${homeworkId}/stats`);
    expect(res.status()).toBe(200);
    const stats = (await safeJson(res)) as {
      totalStudents: number;
      submitted: number;
      graded: number;
      lateSubmissions: number;
      averageScore: number | null;
      highestScore: number | null;
      lowestScore: number | null;
      pending: number;
    };
    expect(stats.submitted).toBe(1);
    expect(stats.graded).toBe(1);
    expect(stats.lateSubmissions).toBe(0);
    expect(stats.averageScore).toBe(45);
    expect(stats.highestScore).toBe(45);
    expect(stats.lowestScore).toBe(45);
    expect(stats.totalStudents).toBeGreaterThanOrEqual(1);
    expect(stats.pending).toBe(stats.totalStudents - stats.submitted);
  });

  test("the learner's own submissions view carries the grade and the nested homework", async () => {
    const res = await GET(learner, "/api/homework/student/submissions");
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as { submissions: Submission[]; pending: Homework[] };
    const row = body.submissions.find((s) => s.id === submissionId);
    expect(row).toBeTruthy();
    expect(row!.score).toBe(45);
    // homeworkId is the populated assignment, and gradedBy the populated grader.
    expect(typeof row!.homeworkId).toBe("object");
    expect((row!.homeworkId as { title: string }).title).toBe(`${RUN} Lifecycle EDITED`);
    expect((row!.gradedBy as { id: string }).id).toBe(m.users.teacher.lmsUserId);
    expect(Array.isArray(body.pending)).toBe(true);
  });

  test("a status filter narrows the learner's submissions", async () => {
    const graded = (await safeJson(
      await GET(learner, "/api/homework/student/submissions?status=graded"),
    )) as { submissions: Submission[] };
    expect(graded.submissions.every((s) => s.status === "graded")).toBe(true);
    expect(graded.submissions.some((s) => s.id === submissionId)).toBe(true);
  });

  test("DELETE is REFUSED once a student has submitted work", async () => {
    // Under Postgres `LmsHomeworkSubmission.homework` is onDelete:Cascade, so a
    // delete here would irreversibly wipe every student's submission, grade,
    // feedback and rubric — from an endpoint open to any TEACHER.
    const res = await DELETE(teacher, `/api/homework/${homeworkId}`);
    expect(res.status(), "homework-service.ts:216-222 refuses this delete").toBe(400);
    expect(((await safeJson(res)) as Envelope<never>).message).toContain("submission");

    // …and the work is still there.
    const rows = (await safeJson(
      await GET(teacher, `/api/homework/${homeworkId}/submissions`),
    )) as Submission[];
    expect(rows.some((s) => s.id === submissionId)).toBe(true);
  });

  test("close stops further submissions", async () => {
    const res = await PATCH(teacher, `/api/homework/${homeworkId}/close`);
    expect(res.status()).toBe(200);
    expect(((await safeJson(res)) as Homework).status).toBe("closed");

    const read = (await safeJson(await GET(teacher, `/api/homework/${homeworkId}`))) as Homework;
    expect(read.status).toBe("closed");
  });

  test("submitting to a closed homework is refused", async () => {
    const { api: learnerB } = await provisionLearnerB();
    const res = await POST(learnerB, `/api/homework/${homeworkId}/submit`, {
      textResponse: "too late",
    });
    expect(res.status(), "homework-service.ts:226").toBe(400);
    expect(((await safeJson(res)) as Envelope<never>).message).toContain("closed");
    await learnerB.dispose();
  });
});

// ── Late submission + penalty ────────────────────────────────────────────────

test.describe("Phase 18 — late submission penalty", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let teacher: APIRequestContext;
  let learner: APIRequestContext;
  let lateHwId: string;
  let strictHwId: string;
  let lateSubmissionId: string;

  test.beforeAll(async () => {
    teacher = await apiAs("teacher");
    learner = await apiAs("learner");
    const past = new Date(Date.now() - 864e5).toISOString();
    lateHwId = (
      await createHomework(teacher, `${RUN} Late allowed`, {
        dueDate: past,
        allowLateSubmission: true,
        latePenaltyPercent: 25,
      })
    ).id;
    strictHwId = (
      await createHomework(teacher, `${RUN} Late refused`, {
        dueDate: past,
        allowLateSubmission: false,
      })
    ).id;
  });
  test.afterAll(async () => {
    await teacher.dispose();
    await learner.dispose();
  });

  test("a late submission is refused when the homework forbids it", async () => {
    const res = await POST(learner, `/api/homework/${strictHwId}/submit`, { textResponse: "late" });
    expect(res.status()).toBe(400);
    expect(((await safeJson(res)) as Envelope<never>).message).toContain("Late submissions");
  });

  test("a late submission is accepted and flagged when allowed", async () => {
    const res = await POST(learner, `/api/homework/${lateHwId}/submit`, { textResponse: "late" });
    expect(res.status()).toBe(200);
    const sub = (await safeJson(res)) as Submission;
    lateSubmissionId = sub.id;
    expect(sub.isLate).toBe(true);
  });

  test("the late penalty is applied to finalScore, not to score", async () => {
    const res = await PATCH(teacher, `/api/homework/submissions/${lateSubmissionId}/grade`, {
      score: 80,
    });
    expect(res.status()).toBe(200);
    const graded = (await safeJson(res)) as Submission & { latePenaltyApplied: number };
    // 25% of 80 = 20 → finalScore 60, with the raw mark preserved.
    expect(graded.score).toBe(80);
    expect(graded.latePenaltyApplied).toBe(20);
    expect(graded.finalScore).toBe(60);
  });

  test("stats average on the RAW score, and the late count is visible", async () => {
    const stats = (await safeJson(await GET(teacher, `/api/homework/${lateHwId}/stats`))) as {
      lateSubmissions: number;
      averageScore: number | null;
    };
    expect(stats.lateSubmissions).toBe(1);
    // getHomeworkStats reduces over `s.score`, not `finalScore`
    // (homework-service.ts:305-310).
    expect(stats.averageScore).toBe(80);
  });
});

// ── Access control and error shapes ──────────────────────────────────────────

test.describe("Phase 18 — guards", () => {
  test.setTimeout(150_000);

  for (const role of ["learner", "parent", "manager"] as const) {
    test(`${role} cannot create, edit or grade homework`, async () => {
      const api = await apiAs(role);
      expect(
        (await POST(api, "/api/homework", {
          title: `${RUN} illegal`,
          batchId: m.batchId,
          dueDate: new Date(Date.now() + 864e5).toISOString(),
        })).status(),
      ).toBe(403);
      expect((await PATCH(api, `/api/homework/${MISSING}`, { title: "x" })).status()).toBe(403);
      expect((await DELETE(api, `/api/homework/${MISSING}`)).status()).toBe(403);
      expect(
        (await PATCH(api, `/api/homework/submissions/${MISSING}/grade`, { score: 100 })).status(),
      ).toBe(403);
      await api.dispose();
    });
  }

  for (const role of ["learner", "parent"] as const) {
    test(`${role} cannot read a homework's submissions or stats`, async () => {
      const api = await apiAs(role);
      expect((await GET(api, `/api/homework/${MISSING}/submissions`)).status()).toBe(403);
      expect((await GET(api, `/api/homework/${MISSING}/stats`)).status()).toBe(403);
      expect((await GET(api, "/api/homework/teacher")).status()).toBe(403);
      await api.dispose();
    });
  }

  for (const role of ["teacher", "manager", "tenantAdmin"] as const) {
    test(`${role} cannot submit homework as a student`, async () => {
      const api = await apiAs(role);
      const res = await POST(api, `/api/homework/${MISSING}/submit`, { textResponse: "x" });
      expect(res.status(), "submit is LEARNER-only").toBe(403);
      await api.dispose();
    });
  }

  test("a nonexistent homework id yields 404 across the surface, not 500", async () => {
    const teacher = await apiAs("teacher");
    expect((await GET(teacher, `/api/homework/${MISSING}`)).status()).toBe(404);
    expect((await PATCH(teacher, `/api/homework/${MISSING}`, { title: "x" })).status()).toBe(404);
    expect((await PATCH(teacher, `/api/homework/${MISSING}/publish`)).status()).toBe(404);
    expect((await PATCH(teacher, `/api/homework/${MISSING}/close`)).status()).toBe(404);
    expect((await DELETE(teacher, `/api/homework/${MISSING}`)).status()).toBe(404);
    expect((await GET(teacher, `/api/homework/${MISSING}/stats`)).status()).toBe(404);
    await teacher.dispose();
  });

  test("grading a nonexistent submission yields 404", async () => {
    const teacher = await apiAs("teacher");
    const res = await PATCH(teacher, `/api/homework/submissions/${MISSING}/grade`, { score: 10 });
    expect(res.status()).toBe(404);
    await teacher.dispose();
  });

  test("a malformed id does not surface a Prisma 500", async () => {
    const teacher = await apiAs("teacher");
    expect((await GET(teacher, "/api/homework/not-a-uuid")).status()).toBe(404);
    await teacher.dispose();
  });

  test("grade validation rejects an out-of-range score", async () => {
    const teacher = await apiAs("teacher");
    const res = await PATCH(teacher, `/api/homework/submissions/${MISSING}/grade`, { score: 5000 });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { validationErrors?: Array<{ field: string }> };
    expect(body.validationErrors!.some((v) => v.field === "score")).toBe(true);
    await teacher.dispose();
  });

  test("create validation rejects a missing batchId/dueDate", async () => {
    const teacher = await apiAs("teacher");
    const res = await POST(teacher, "/api/homework", { title: `${RUN} incomplete` });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { validationErrors?: Array<{ field: string }> };
    expect(body.validationErrors!.map((v) => v.field)).toEqual(
      expect.arrayContaining(["batchId", "dueDate"]),
    );
    await teacher.dispose();
  });

  test("unauthenticated homework access is rejected", async () => {
    const anon = await apiAnon();
    expect([401, 403]).toContain((await GET(anon, `/api/homework/${MISSING}`)).status());
    expect([401, 403]).toContain((await GET(anon, "/api/homework/teacher")).status());
    expect([401, 403]).toContain((await GET(anon, "/api/homework/student/submissions")).status());
    await anon.dispose();
  });

  test("[informational] POST /api/homework answers 200, not the 201 the repo standard prescribes", async () => {
    // CLAUDE.md, "API Route Pattern": "POST returns 201 on creation". The
    // sibling `/api/question-bank` and `/api/exams` both do; this one returns
    // `json(await create(...))`, which defaults to 200
    // (app/api/homework/route.ts:31). Cosmetic, and no caller is provably
    // broken, so it is recorded rather than asserted.
    const teacher = await apiAs("teacher");
    const res = await POST(teacher, "/api/homework", {
      title: `${RUN} status-probe`,
      batchId: m.batchId,
      dueDate: new Date(Date.now() + 864e5).toISOString(),
    });
    console.log(`[INFO] POST /api/homework → HTTP ${res.status()} (repo standard says 201)`);
    expect([200, 201]).toContain(res.status());
    await teacher.dispose();
  });

  test("homework creation with an unresolvable batchId yields 4xx, not 500", async () => {
    /**
     * FAILING BY DESIGN — verified.
     *
     * `create` writes `dto.batchId` straight into the insert with no existence
     * or ownership lookup (lib/services/homework-service.ts:114-135). An id
     * that resolves to no batch therefore reaches Postgres and violates the
     * foreign key; Prisma raises P2003, which `toErrorResponse` does not map —
     * it handles only P2002 and P2025 (lib/http.ts:96-113) — so the request
     * ends as an opaque `500 Internal server error`.
     *
     * Reproduced: POST /api/homework with `batchId` = an all-zeros uuid →
     * HTTP 500, envelope message "Internal server error".
     *
     * The same missing lookup has a second consequence that this fixture
     * cannot demonstrate (the seed's victim tenant has no batch to point at):
     * a batch id belonging to ANOTHER tenant would satisfy the foreign key,
     * and `batchLite` reads it back with `findUnique({where:{id}})` and no
     * orgId filter (homework-service.ts:96-106), so the foreign batch's name,
     * grade and subject would be echoed to the caller on every read.
     *
     * Severity: Low as observed (an unvalidated input yields a 500 instead of
     * a field-level 400); Medium for the unproven cross-tenant echo, which
     * shares the single root cause — validate the batch against `orgId` before
     * the insert.
     */
    const teacher = await apiAs("teacher");
    const res = await POST(teacher, "/api/homework", {
      title: `${RUN} orphan-batch`,
      batchId: MISSING,
      dueDate: new Date(Date.now() + 864e5).toISOString(),
    });
    const status = res.status();
    await teacher.dispose();
    expect(
      status,
      "UNHANDLED DB ERROR: an unresolvable batchId reaches Postgres and the P2003 foreign-key " +
        "violation is returned as a 500 (lib/services/homework-service.ts:114-135 does not " +
        "validate the batch; lib/http.ts:96-113 maps only P2002/P2025).",
    ).toBeLessThan(500);
  });
});

// ── Cross-student access ─────────────────────────────────────────────────────

test.describe("Phase 18 — a learner cannot reach another student's work", () => {
  test.setTimeout(180_000);

  let teacher: APIRequestContext;
  let learnerA: APIRequestContext;
  let learnerB: APIRequestContext;
  let homeworkId: string;
  let submissionA: string;

  test.beforeAll(async () => {
    teacher = await apiAs("teacher");
    learnerA = await apiAs("learner");
    ({ api: learnerB } = await provisionLearnerB());
    homeworkId = (await createHomework(teacher, `${RUN} CrossStudent`)).id;
    const res = await POST(learnerA, `/api/homework/${homeworkId}/submit`, {
      textResponse: `${RUN} A's private answer`,
    });
    submissionA = ((await safeJson(res)) as Submission).id;
    await PATCH(teacher, `/api/homework/submissions/${submissionA}/grade`, {
      score: 91,
      feedback: `${RUN} A's private feedback`,
    });
  });
  test.afterAll(async () => {
    await teacher.dispose();
    await learnerA.dispose();
    await learnerB?.dispose();
  });

  test("learner B's own submissions view never contains learner A's work", async () => {
    const raw = await (await GET(learnerB, "/api/homework/student/submissions")).text();
    expect(raw, "LEAK: A's answer text reached another learner").not.toContain(
      "A's private answer",
    );
    expect(raw, "LEAK: A's feedback reached another learner").not.toContain("A's private feedback");
  });

  test("a LEARNER cannot override the studentId query parameter", async () => {
    // The route pins `studentId` to `actor.id` unless the caller is a PARENT
    // (app/api/homework/student/submissions/route.ts:12).
    const raw = await (
      await GET(
        learnerB,
        `/api/homework/student/submissions?studentId=${m.users.learner.lmsUserId}`,
      )
    ).text();
    expect(raw, "LEAK: a learner impersonated another student via ?studentId=").not.toContain(
      "A's private answer",
    );
  });

  test("a LEARNER cannot read the submission list for a homework", async () => {
    expect((await GET(learnerB, `/api/homework/${homeworkId}/submissions`)).status()).toBe(403);
  });

  test("a LEARNER cannot grade their own submission", async () => {
    const res = await PATCH(learnerA, `/api/homework/submissions/${submissionA}/grade`, {
      score: 100,
    });
    expect(res.status(), "self-grading must be refused at the role gate").toBe(403);

    const rows = (await safeJson(
      await GET(teacher, `/api/homework/${homeworkId}/submissions`),
    )) as Submission[];
    expect(rows.find((s) => s.id === submissionA)!.score).toBe(91);
  });

  test("a PARENT must not read an unrelated student's submissions and grades", async () => {
    /**
     * FAILING BY DESIGN — verified.
     *
     * app/api/homework/student/submissions/route.ts:12 reads:
     *   const studentId = actor.role === 'PARENT' && studentIdParam ? studentIdParam : actor.id;
     * so a PARENT may name ANY student id in the org and the service fetches it
     * unconditionally (lib/services/homework-service.ts:getStudentSubmissions,
     * filtering on `{orgId, studentId}` only).
     *
     * The link table this would need exists — `LmsUserParent`
     * (packages/database/prisma/schema.prisma:16494-16509) — and nothing on
     * this path reads it. The seeded parent has no child link whatsoever, so
     * the 200 below is an unrelated adult reading a named child's submitted
     * work, teacher feedback and grades.
     *
     * Severity: High (unauthorized access to minors' personal data, trivially
     * enumerable by student id).
     */
    const parent = await apiAs("parent");
    const res = await GET(
      parent,
      `/api/homework/student/submissions?studentId=${m.users.learner.lmsUserId}`,
    );
    const raw = await res.text();
    await parent.dispose();
    expect(
      raw,
      "MISSING AUTHORIZATION: a PARENT with no parent↔child link read another student's " +
        "homework submissions and feedback (app/api/homework/student/submissions/route.ts:12 " +
        "trusts ?studentId= for any PARENT).",
    ).not.toContain("A's private answer");
  });
});
