/**
 * PHASE 17 — Gradebook (`/api/gradebook/*`), all 4 routes.
 *
 *   POST /api/gradebook/compute?batchId=&term=
 *   GET  /api/gradebook/student/[id]
 *   GET  /api/gradebook/student/[id]/transcript?academicYear=
 *   GET  /api/gradebook/batch/[batchId]/rankings?term=
 *
 * TWO THINGS ARE UNUSUAL ABOUT THIS SURFACE, and both shape the file:
 *
 *  1. NO ROLE GUARD ANYWHERE. All four handlers call `requireAuth` and stop —
 *     none calls `requireRoles` (app/api/gradebook/compute/route.ts:7,
 *     student/[id]/route.ts:7, student/[id]/transcript/route.ts:7,
 *     batch/[batchId]/rankings/route.ts:8). Scoping is `orgId` only, and the
 *     `studentId` comes straight from the URL. The "cross-learner" describe
 *     below is therefore expected to FAIL; see its block comment.
 *
 *  2. NO SUCCESS ENVELOPE. They return `json(await service(...))` — a bare
 *     array or object, not `{success:true,data}`. Asserted as-is and recorded
 *     as a deviation rather than silently accommodated.
 *
 * The fixture builds a PRIVATE batch per run. The seeded batch accumulates
 * submissions across runs, which would make the homework-average assertion
 * drift; a fresh batch keeps the arithmetic deterministic.
 */

import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest, mintSessionToken } from "../fixtures/auth";

const m = loadManifest();
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3020";
const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT17-${Date.now()}`;
const LEARNER_B_EMAIL = "e2e-learner-b@quiklms.test";

/** See phase14: dev-server cold compiles blow the 15s actionTimeout. */
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

interface GradeRecord {
  id: string;
  studentId: { id: string; email: string } | string;
  batchId: { id: string; name: string } | string;
  subject: string;
  academicYear: string;
  homeworkAverage: number;
  attendancePercent: number;
  overallPercentage: number;
  finalGrade: string;
  gradePoints: number;
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

/**
 * A schedule slot no other batch occupies.
 *
 * `POST /api/batches` rejects a teacher double-booking ("Teacher already
 * assigned during this time"), and audit batches are never cleaned up — so a
 * fixed slot collides with the previous run's leftovers. The hour varies with
 * the run clock and the weekday with a per-run counter, which keeps successive
 * runs and the two describes in this file out of each other's way.
 */
let batchSeq = 0;
function uniqueSchedule() {
  const hour = 6 + (Math.floor(Date.now() / 1000) % 14); // 06:00–19:00, per run
  const hh = String(hour).padStart(2, "0");
  const dayOfWeek = 1 + (batchSeq++ % 5); // Mon–Fri, distinct within a run
  return [{ dayOfWeek, startTime: `${hh}:00`, endTime: `${hh}:45` }];
}

/**
 * A batch of our own, with both learners enrolled.
 *
 * `POST /api/batches` refuses a teacher with no weekly availability
 * ("Teacher has no availability slots defined"), which the seed does not
 * create, so the slots are set first. That write is idempotent — it replaces
 * the seeded teacher's slot list with one that covers the batch schedule below
 * — and is the only way to reach the batch-create path at all.
 */
async function createBatch(admin: APIRequestContext, studentIds: string[]): Promise<string> {
  const schedule = uniqueSchedule();
  const avail = await admin.put(`/api/teacher-availability/${m.users.teacher.lmsUserId}`, {
    timeout: CEIL,
    data: {
      slots: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: "00:00",
        endTime: "23:59",
      })),
      maxSlotsPerWeek: 60,
    },
  });
  expect(avail.status(), `teacher availability said ${await avail.text()}`).toBe(200);

  const res = await POST(admin, "/api/batches", {
    name: `${RUN} Batch`,
    grade: "10",
    section: "Z",
    subject: `${RUN}-Subject`,
    teacherId: m.users.teacher.lmsUserId,
    academicYear: "2026-2027",
    startDate: new Date(Date.now() - 7 * 864e5).toISOString(),
    endDate: new Date(Date.now() + 90 * 864e5).toISOString(),
    schedule,
    maxCapacity: 30,
    status: "active",
    studentIds,
  });
  expect(res.status(), `batch create said ${await res.text()}`).toBe(200);
  const body = (await safeJson(res)) as { id?: string };
  return body.id!;
}

// ── Compute + read-back ──────────────────────────────────────────────────────

test.describe("Phase 17 — compute and read back", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let teacher: APIRequestContext;
  let learnerA: APIRequestContext;
  let learnerBId: string;
  let learnerB: APIRequestContext;
  let batchId: string;

  test.beforeAll(async () => {
    admin = await apiAs("tenantAdmin");
    teacher = await apiAs("teacher");
    learnerA = await apiAs("learner");
    ({ id: learnerBId, api: learnerB } = await provisionLearnerB());
    batchId = await createBatch(admin, [m.users.learner.lmsUserId, learnerBId]);

    // Two homeworks for learner A in this batch: one graded 80, one left
    // UNGRADED. That pair is the whole point of the average test below.
    const due = new Date(Date.now() + 864e5).toISOString();
    const mkHomework = async (title: string) => {
      const res = await POST(teacher, "/api/homework", {
        title,
        batchId,
        dueDate: due,
        maxScore: 100,
        type: "assignment",
      });
      return ((await safeJson(res)) as { id: string }).id;
    };
    const hw1 = await mkHomework(`${RUN} HW graded`);
    const hw2 = await mkHomework(`${RUN} HW ungraded`);

    const sub1 = await POST(learnerA, `/api/homework/${hw1}/submit`, { textResponse: "answer 1" });
    const submissionId = ((await safeJson(sub1)) as { id: string }).id;
    await POST(learnerA, `/api/homework/${hw2}/submit`, { textResponse: "answer 2" });

    const graded = await PATCH(teacher, `/api/homework/submissions/${submissionId}/grade`, {
      score: 80,
      feedback: `${RUN}`,
    });
    expect(graded.status()).toBe(200);
  });

  test.afterAll(async () => {
    await admin.dispose();
    await teacher.dispose();
    await learnerA.dispose();
    await learnerB?.dispose();
  });

  test("compute processes every enrolled student", async () => {
    const res = await POST(admin, `/api/gradebook/compute?batchId=${batchId}`);
    expect(res.status()).toBe(200);
    // NOTE: no `{success,data}` envelope — see the header comment.
    const body = (await safeJson(res)) as {
      batchId: string;
      studentsProcessed: number;
      grades: GradeRecord[];
    };
    expect(body.batchId).toBe(batchId);
    expect(body.studentsProcessed).toBe(2);
    expect(body.grades).toHaveLength(2);
  });

  test("an UNGRADED submission is excluded from the average, not counted as zero", async () => {
    // Learner A has [80, ungraded]. Mongo's `$avg` dropped nulls from both the
    // numerator AND the denominator, so the correct answer is 80. Counting the
    // ungraded row as 0 would give 40 — which, at 70% weight, turns a B into an
    // F and then feeds the class rankings (lib/services/gradebook-service.ts:
    // 30-45 documents exactly this).
    const res = await GET(admin, `/api/gradebook/student/${m.users.learner.lmsUserId}`);
    expect(res.status()).toBe(200);
    const records = (await safeJson(res)) as GradeRecord[];
    const rec = records.find((r) => (r.batchId as { id: string }).id === batchId);
    expect(rec, "the computed record must be readable back").toBeTruthy();
    expect(
      rec!.homeworkAverage,
      "an ungraded submission was averaged in as a zero",
    ).toBe(80);
  });

  test("the weighted overall and letter grade follow from the components", async () => {
    const records = (await safeJson(
      await GET(admin, `/api/gradebook/student/${m.users.learner.lmsUserId}`),
    )) as GradeRecord[];
    const rec = records.find((r) => (r.batchId as { id: string }).id === batchId)!;
    // 70% homework + 30% attendance; no attendance rows were seeded for this
    // batch, so attendancePercent is 0 and overall is 0.7 * homeworkAverage.
    expect(rec.attendancePercent).toBe(0);
    const expected = Math.round(rec.homeworkAverage * 0.7 * 100) / 100;
    expect(rec.overallPercentage).toBe(expected);

    // The ladder is >=90 A, >=80 B, >=70 C, >=60 D, else F
    // (gradebook-service.ts:computeLetterGrade). 0.7 * 80 = 56, so an F — and
    // note what that means in practice: a student averaging 80 on homework is
    // graded F because attendance is 30% of the weighting and this batch has no
    // attendance rows at all. Recorded, not asserted as a defect: the weighting
    // is a documented product decision, not a port bug.
    const ladder: Array<[number, string, number]> = [
      [90, "A", 4],
      [80, "B", 3],
      [70, "C", 2],
      [60, "D", 1],
      [0, "F", 0],
    ];
    const [, grade, points] = ladder.find(([floor]) => rec.overallPercentage >= floor)!;
    expect(rec.finalGrade).toBe(grade);
    expect(rec.gradePoints).toBe(points);
  });

  test("records are enriched: studentId and batchId come back populated", async () => {
    const records = (await safeJson(
      await GET(admin, `/api/gradebook/student/${m.users.learner.lmsUserId}`),
    )) as GradeRecord[];
    const rec = records.find((r) => (r.batchId as { id: string }).id === batchId)!;
    expect(typeof rec.studentId, "studentId must be the populated user, not a uuid").toBe("object");
    expect((rec.studentId as { email: string }).email).toBe(m.users.learner.email.toLowerCase());
    expect((rec.batchId as { name: string }).name).toBe(`${RUN} Batch`);
  });

  test("the transcript returns the same records and honours academicYear", async () => {
    const all = (await safeJson(
      await GET(admin, `/api/gradebook/student/${m.users.learner.lmsUserId}/transcript`),
    )) as GradeRecord[];
    expect(all.some((r) => (r.batchId as { id: string }).id === batchId)).toBe(true);

    const matching = (await safeJson(
      await GET(
        admin,
        `/api/gradebook/student/${m.users.learner.lmsUserId}/transcript?academicYear=2026-2027`,
      ),
    )) as GradeRecord[];
    expect(matching.some((r) => (r.batchId as { id: string }).id === batchId)).toBe(true);

    const other = (await safeJson(
      await GET(
        admin,
        `/api/gradebook/student/${m.users.learner.lmsUserId}/transcript?academicYear=1999-2000`,
      ),
    )) as GradeRecord[];
    expect(other, "an unmatched academicYear must filter everything out").toHaveLength(0);
  });

  test("rankings list the batch descending, with no NULLS-FIRST inversion", async () => {
    const res = await GET(admin, `/api/gradebook/batch/${batchId}/rankings`);
    expect(res.status()).toBe(200);
    const rows = (await safeJson(res)) as GradeRecord[];
    expect(rows).toHaveLength(2);

    const pcts = rows.map((r) => r.overallPercentage ?? null);
    // Postgres defaults to NULLS FIRST on DESC, which would rank an uncomputed
    // record #1 in the class; the service pins `nulls:'last'`.
    const nonNull = pcts.filter((p): p is number => p !== null);
    expect([...nonNull].sort((a, b) => b - a)).toEqual(nonNull);
    const firstNull = pcts.findIndex((p) => p === null);
    if (firstNull >= 0) {
      expect(pcts.slice(firstNull).every((p) => p === null), "a null ranked above a score").toBe(true);
    }
    // Learner A (80 homework) must outrank learner B (no submissions).
    expect((rows[0].studentId as { id: string }).id).toBe(m.users.learner.lmsUserId);
  });

  test("recomputing is idempotent — it updates in place, it does not duplicate", async () => {
    const before = (await safeJson(
      await GET(admin, `/api/gradebook/batch/${batchId}/rankings`),
    )) as GradeRecord[];
    expect((await POST(admin, `/api/gradebook/compute?batchId=${batchId}`)).status()).toBe(200);
    const after = (await safeJson(
      await GET(admin, `/api/gradebook/batch/${batchId}/rankings`),
    )) as GradeRecord[];
    // @@unique([orgId, studentId, batchId, term]) plus the find-then-write
    // transaction — a second compute must not add rows.
    expect(after).toHaveLength(before.length);
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
  });

  test("a term-scoped compute produces a SEPARATE record", async () => {
    expect((await POST(admin, `/api/gradebook/compute?batchId=${batchId}&term=Term2`)).status()).toBe(200);
    const rows = (await safeJson(
      await GET(admin, `/api/gradebook/batch/${batchId}/rankings`),
    )) as Array<GradeRecord & { term: string | null }>;
    expect(rows.filter((r) => r.term === "Term2")).toHaveLength(2);

    const filtered = (await safeJson(
      await GET(admin, `/api/gradebook/batch/${batchId}/rankings?term=Term2`),
    )) as Array<GradeRecord & { term: string | null }>;
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.term === "Term2")).toBe(true);
  });
});

// ── Error shapes ─────────────────────────────────────────────────────────────

test.describe("Phase 17 — guards", () => {
  test.setTimeout(120_000);

  test("compute against a nonexistent batch yields 404, not 500", async () => {
    const admin = await apiAs("tenantAdmin");
    const res = await POST(admin, `/api/gradebook/compute?batchId=${MISSING}`);
    expect(res.status()).toBe(404);
    expect(((await safeJson(res)) as Envelope<never>).statusCode).toBe(404);
    await admin.dispose();
  });

  test("compute with no batchId at all yields 404, not 500", async () => {
    const admin = await apiAs("tenantAdmin");
    const res = await POST(admin, "/api/gradebook/compute");
    expect(res.status()).toBe(404);
    await admin.dispose();
  });

  test("an unknown student id returns an empty list, not an error", async () => {
    const admin = await apiAs("tenantAdmin");
    expect((await GET(admin, `/api/gradebook/student/${MISSING}`)).status()).toBe(200);
    expect(await safeJson(await GET(admin, `/api/gradebook/student/${MISSING}`))).toEqual([]);
    expect(
      await safeJson(await GET(admin, `/api/gradebook/student/${MISSING}/transcript`)),
    ).toEqual([]);
    await admin.dispose();
  });

  test("a malformed id does not surface a Prisma 500", async () => {
    const admin = await apiAs("tenantAdmin");
    expect((await GET(admin, "/api/gradebook/student/not-a-uuid")).status()).toBe(200);
    expect((await GET(admin, "/api/gradebook/batch/not-a-uuid/rankings")).status()).toBe(200);
    await admin.dispose();
  });

  test("unauthenticated gradebook access is rejected", async () => {
    const anon = await apiAnon();
    for (const p of [
      `/api/gradebook/student/${MISSING}`,
      `/api/gradebook/student/${MISSING}/transcript`,
      `/api/gradebook/batch/${MISSING}/rankings`,
    ]) {
      expect([401, 403], `${p} was reachable anonymously`).toContain((await GET(anon, p)).status());
    }
    expect([401, 403]).toContain((await POST(anon, `/api/gradebook/compute?batchId=${MISSING}`)).status());
    await anon.dispose();
  });

  test("[informational] the gradebook returns a bare payload, not the {success,data} envelope", async () => {
    // Every other audited domain answers `{success:true,data}` (lib/http.ts).
    // These four routes do `json(await service(...))`, so a client cannot use a
    // shared unwrapper. Recorded, not asserted as a defect — the shape is
    // consistent within the domain and no caller is provably broken by it.
    const admin = await apiAs("tenantAdmin");
    const body = (await safeJson(await GET(admin, `/api/gradebook/student/${MISSING}`))) as unknown;
    console.log(`[INFO] GET /api/gradebook/student/:id shape → ${JSON.stringify(body)}`);
    expect(Array.isArray(body)).toBe(true);
    await admin.dispose();
  });
});

// ── Authorization ────────────────────────────────────────────────────────────

/**
 * FAILING BY DESIGN — a verified missing-authorization defect.
 *
 * None of the four gradebook routes calls `requireRoles`, and none checks that
 * the caller owns (or is responsible for) the `studentId` in the path:
 *
 *   app/api/gradebook/student/[id]/route.ts:6-9
 *   app/api/gradebook/student/[id]/transcript/route.ts:6-10
 *   app/api/gradebook/batch/[batchId]/rankings/route.ts:6-11
 *   app/api/gradebook/compute/route.ts:6-12
 *
 * Each forwards `user.orgId` plus the raw path parameter into the service
 * (lib/services/gradebook-service.ts:117-141), which filters on `orgId` alone.
 * Tenant isolation therefore holds, but INTRA-tenant authorization does not:
 * any authenticated user — including a LEARNER or a PARENT — can read any
 * other student's grades and transcript, and the entire class ranking with
 * every classmate's name and email.
 *
 * Reproduced by hand against the running server with a second learner's
 * session: `GET /api/gradebook/student/<learner A id>` returned HTTP 200 with
 * learner A's full grade record (name, email, homeworkAverage, finalGrade), and
 * `GET /api/gradebook/batch/<id>/rankings` returned the whole cohort.
 *
 * Severity: High. Grades are FERPA-class personal data, the endpoints are
 * plainly enumerable by student id, and `compute` is a write that any learner
 * can trigger for a whole batch.
 */
test.describe("Phase 17 — cross-learner gradebook access", () => {
  // Independent findings — not `serial`, so one failure does not hide the rest.
  test.setTimeout(180_000);

  let admin: APIRequestContext;
  let learnerB: APIRequestContext;
  let learnerBId: string;
  let batchId: string;

  test.beforeAll(async () => {
    admin = await apiAs("tenantAdmin");
    ({ id: learnerBId, api: learnerB } = await provisionLearnerB());
    batchId = await createBatch(admin, [m.users.learner.lmsUserId, learnerBId]);
    await POST(admin, `/api/gradebook/compute?batchId=${batchId}`);
  });
  test.afterAll(async () => {
    await admin.dispose();
    await learnerB?.dispose();
  });

  test("learner B must not read learner A's grade record", async () => {
    const res = await GET(learnerB, `/api/gradebook/student/${m.users.learner.lmsUserId}`);
    const rows = (await safeJson(res)) as GradeRecord[];
    const leaked = rows.filter(
      (r) => ((r.studentId as { id?: string })?.id ?? r.studentId) === m.users.learner.lmsUserId,
    );
    expect(
      leaked,
      "MISSING AUTHORIZATION: a LEARNER read another learner's grade records. " +
        "app/api/gradebook/student/[id]/route.ts:6-9 calls requireAuth with no requireRoles " +
        "and no ownership check; gradebook-service.ts:117-121 filters on orgId only.",
    ).toHaveLength(0);
  });

  test("learner B must not read learner A's transcript", async () => {
    const res = await GET(learnerB, `/api/gradebook/student/${m.users.learner.lmsUserId}/transcript`);
    const rows = (await safeJson(res)) as GradeRecord[];
    expect(
      rows,
      "MISSING AUTHORIZATION: a LEARNER read another learner's full academic transcript " +
        "(app/api/gradebook/student/[id]/transcript/route.ts:6-10).",
    ).toHaveLength(0);
  });

  test("a LEARNER must not read the whole class ranking", async () => {
    const res = await GET(learnerB, `/api/gradebook/batch/${batchId}/rankings`);
    const rows = (await safeJson(res)) as GradeRecord[];
    const classmates = rows.filter(
      (r) => ((r.studentId as { id?: string })?.id ?? r.studentId) !== learnerBId,
    );
    expect(
      classmates,
      "MISSING AUTHORIZATION: a LEARNER read every classmate's grade, name and email " +
        "(app/api/gradebook/batch/[batchId]/rankings/route.ts:6-11).",
    ).toHaveLength(0);
  });

  test("a LEARNER must not be able to trigger a batch grade computation", async () => {
    const res = await POST(learnerB, `/api/gradebook/compute?batchId=${batchId}`);
    expect(
      res.status(),
      "MISSING AUTHORIZATION: a LEARNER ran compute for a whole batch — a WRITE that " +
        "rewrites every enrolled student's grade record " +
        "(app/api/gradebook/compute/route.ts:6-12 calls requireAuth with no requireRoles).",
    ).toBe(403);
  });

  test("a PARENT must not read an unrelated student's grades", async () => {
    // `LmsUserParent` (packages/database/prisma/schema.prisma:16494-16509) is
    // the link this would need; nothing on this path consults it. The seeded
    // parent has no child link at all.
    const parent = await apiAs("parent");
    const rows = (await safeJson(
      await GET(parent, `/api/gradebook/student/${m.users.learner.lmsUserId}`),
    )) as GradeRecord[];
    await parent.dispose();
    expect(
      rows,
      "MISSING AUTHORIZATION: a PARENT with no link to the student read their grades.",
    ).toHaveLength(0);
  });
});
