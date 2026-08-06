/**
 * PHASE 23 — Attendance (`/api/attendance/*`), all 5 routes.
 *
 *   POST   /api/attendance/mark                       (TEACHER|TENANT_ADMIN|SUB_ADMIN)
 *   PATCH  /api/attendance/[id]                       (TENANT_ADMIN|SUB_ADMIN|TEACHER)
 *   GET    /api/attendance/class/[classId]            (requireAuth ONLY — no role guard)
 *   GET    /api/attendance/student/[studentId]        (requireAuth ONLY — no role guard)
 *   GET    /api/attendance/batch/[batchId]/report     (TENANT_ADMIN|SUB_ADMIN|TEACHER)
 *
 * The two unguarded reads are the point of this phase. Both take an id
 * straight from the path and hand it to a service that filters on `orgId`
 * alone:
 *   app/api/attendance/student/[studentId]/route.ts:6-8  → attendance-service.ts
 *   app/api/attendance/class/[classId]/route.ts:6-8      → attendance-service.ts
 * That is structurally identical to F-010 (gradebook). Two seeded learners are
 * used so the exposure can be demonstrated with real rows rather than inferred
 * from an empty array — an empty `[]` proves nothing, as the gradebook
 * transcripts showed.
 */

import { test, expect, request, type APIRequestContext } from "@playwright/test";
import { apiAs, safeJson } from "../fixtures/api";
import { loadManifest, mintSessionToken } from "../fixtures/auth";

const m = loadManifest();
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3014";
const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT23-${Date.now()}`;
const LEARNER_B_EMAIL = "e2e-learner-b@quiklms.test";

const CEIL = 60_000;
const GET = (a: APIRequestContext, p: string) => a.get(p, { timeout: CEIL });
const POST = (a: APIRequestContext, p: string, data?: unknown) =>
  a.post(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const PATCH = (a: APIRequestContext, p: string, data?: unknown) =>
  a.patch(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });

interface AttendanceRow {
  id: string;
  studentId: string | { id?: string; _id?: string; email?: string; firstName?: string };
  scheduledClassId?: string | { _id?: string };
  status: string;
  notes?: string | null;
  markedBy?: string | { _id?: string } | null;
}
interface ScheduledClass {
  id: string;
  status: string;
  startTime: string;
}

let learnerBId = "";
let learnerBApi: APIRequestContext;
let classId = "";

const idOf = (v: AttendanceRow["studentId"]): string =>
  typeof v === "string" ? v : (v?.id ?? v?._id ?? "");

test.beforeAll(async () => {
  test.setTimeout(240_000); // rule 9 — this hook does 8+ round-trips
  expect(m.batchId, "seed manifest has no batchId — reseed before running").toBeTruthy();

  const admin = await apiAs("tenantAdmin", { timeout: CEIL });

  // A second learner, so "learner A reads learner B's attendance" is testable.
  // `/api/auth/register` is idempotent — it returns `reused: true` for an
  // existing email rather than 409.
  const reg = await POST(admin, "/api/auth/register", {
    email: LEARNER_B_EMAIL,
    firstName: "E2E",
    lastName: "LearnerB",
    role: "LEARNER",
  });
  expect([200, 201]).toContain(reg.status());
  learnerBId = ((await safeJson(reg)) as { data: { id: string } }).data.id;

  const token = await mintSessionToken("learner", {
    id: learnerBId,
    sub: learnerBId,
    email: LEARNER_B_EMAIL,
  });
  learnerBApi = await request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: `next-auth.session-token=${token}` },
    timeout: CEIL,
  });

  // Both learners in the seeded batch (idempotent).
  const add = await POST(admin, `/api/batches/${m.batchId}/students`, {
    studentIds: [m.users.learner.userId, learnerBId],
  });
  expect(add.status(), `add students said ${await add.text()}`).toBe(200);

  // A class to mark against. Generate a fresh window and take a future
  // scheduled class, so the seeded class stays untouched for other phases.
  const from = new Date();
  from.setDate(from.getDate() + 7);
  const to = new Date(from);
  to.setDate(to.getDate() + 21);
  await POST(admin, "/api/scheduling/classes/generate", {
    batchId: m.batchId,
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  });

  const list = (await safeJson(await GET(admin, "/api/scheduling/teacher/classes"))) as ScheduledClass[];
  const future = list
    .filter((c) => c.status === "scheduled" && new Date(c.startTime) > new Date())
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime)); // take the LAST one,
  // so phase 22's mutations (which consume the earliest) never collide with it.
  expect(future.length, "no future scheduled class to mark attendance against").toBeGreaterThan(0);
  classId = future[0].id;

  /**
   * Mark attendance HERE rather than relying on the first test to do it.
   * The ownership tests below need real rows to be meaningful, and a `-g`
   * filtered run (which is how findings get re-verified) would otherwise skip
   * the test that creates them and report a false "no exposure" — exactly the
   * empty-array trap that made F-010's transcripts look safe.
   */
  const teacher = await apiAs("teacher", { timeout: CEIL });
  const marked = await POST(teacher, "/api/attendance/mark", {
    scheduledClassId: classId,
    batchId: m.batchId,
    students: [
      { studentId: m.users.learner.userId, status: "present", notes: `${RUN} A` },
      { studentId: learnerBId, status: "absent", notes: `${RUN} B` },
    ],
  });
  // 400 = "Attendance has already been marked for this class" on a re-run
  // against the same generated class. Both outcomes leave the rows we need.
  expect([200, 400], `fixture mark said ${await marked.text()}`).toContain(marked.status());
  await teacher.dispose();

  await admin.dispose();
});

test.afterAll(async () => {
  await learnerBApi?.dispose();
});

test.describe("Phase 23 — attendance: mark, edit, report", () => {
  test("POST /api/attendance/mark records both students, verified by read-back", async () => {
    test.setTimeout(120_000);
    const teacher = await apiAs("teacher", { timeout: CEIL });

    // The mark itself happens in `beforeAll` (so a filtered re-run of the
    // ownership tests still has data). Marking is one-shot per class — a second
    // POST is refused with 400 "Attendance has already been marked for this
    // class", which is a real integrity guard and is asserted here rather than
    // worked around.
    const dup = await POST(teacher, "/api/attendance/mark", {
      scheduledClassId: classId,
      batchId: m.batchId,
      students: [{ studentId: m.users.learner.userId, status: "absent" }],
    });
    expect(dup.status(), "double-marking a class must be refused").toBe(400);

    const back = (await safeJson(await GET(teacher, `/api/attendance/class/${classId}`))) as AttendanceRow[];
    expect(Array.isArray(back)).toBe(true);
    const a = back.find((r) => idOf(r.studentId) === m.users.learner.userId);
    const b = back.find((r) => idOf(r.studentId) === learnerBId);
    expect(a, "learner A's attendance row missing after mark").toBeTruthy();
    expect(b, "learner B's attendance row missing after mark").toBeTruthy();
    expect(a!.status, "learner A was marked present").toBe("present");
    // B's status is re-written by the edit test below, so on a re-run it is
    // 'excused' rather than 'absent'. Assert it is a valid state, not a value.
    expect(["present", "absent", "late", "excused"]).toContain(b!.status);

    await teacher.dispose();
  });

  test("PATCH /api/attendance/[id] edits a record, verified by read-back", async () => {
    test.setTimeout(120_000);
    const teacher = await apiAs("teacher", { timeout: CEIL });

    const rows = (await safeJson(await GET(teacher, `/api/attendance/class/${classId}`))) as AttendanceRow[];
    const target = rows.find((r) => idOf(r.studentId) === learnerBId);
    expect(target, "no attendance row to edit — run the mark test first").toBeTruthy();

    const res = await PATCH(teacher, `/api/attendance/${target!.id}`, {
      status: "excused",
      reason: `${RUN} corrected`,
      notes: `${RUN} note`,
    });
    expect(res.status(), `edit said ${await res.text()}`).toBe(200);

    const after = (await safeJson(await GET(teacher, `/api/attendance/class/${classId}`))) as AttendanceRow[];
    const edited = after.find((r) => r.id === target!.id);
    expect(edited!.status, "edit did not persist").toBe("excused");

    await teacher.dispose();
  });

  test("GET /api/attendance/batch/[id]/report returns records and a summary", async () => {
    const teacher = await apiAs("teacher", { timeout: CEIL });
    const res = await GET(teacher, `/api/attendance/batch/${m.batchId}/report`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as { records: unknown[]; summary: unknown[] };
    expect(Array.isArray(body.records)).toBe(true);
    expect(Array.isArray(body.summary)).toBe(true);
    await teacher.dispose();
  });

  test("GET /api/attendance/student/[id] returns the student's own history", async () => {
    const learner = await apiAs("learner", { timeout: CEIL });
    const res = await GET(learner, `/api/attendance/student/${m.users.learner.userId}`);
    expect(res.status()).toBe(200);
    const rows = (await safeJson(res)) as AttendanceRow[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length, "own attendance should be readable").toBeGreaterThan(0);
    await learner.dispose();
  });
});

test.describe("Phase 23 — attendance: role gating", () => {
  test("LEARNER cannot mark attendance", async () => {
    const learner = await apiAs("learner", { timeout: CEIL });
    const res = await POST(learner, "/api/attendance/mark", {
      scheduledClassId: classId,
      students: [{ studentId: m.users.learner.userId, status: "present" }],
    });
    expect(res.status(), "a learner must not be able to mark themselves present").toBe(403);
    await learner.dispose();
  });

  test("PARENT cannot mark attendance", async () => {
    const parent = await apiAs("parent", { timeout: CEIL });
    const res = await POST(parent, "/api/attendance/mark", {
      scheduledClassId: classId,
      students: [{ studentId: m.users.learner.userId, status: "present" }],
    });
    expect(res.status()).toBe(403);
    await parent.dispose();
  });

  test("LEARNER cannot edit an attendance record", async () => {
    const teacher = await apiAs("teacher", { timeout: CEIL });
    const rows = (await safeJson(await GET(teacher, `/api/attendance/class/${classId}`))) as AttendanceRow[];
    await teacher.dispose();
    expect(rows.length).toBeGreaterThan(0);

    const learner = await apiAs("learner", { timeout: CEIL });
    const res = await PATCH(learner, `/api/attendance/${rows[0].id}`, {
      status: "present",
      reason: `${RUN} tamper`,
    });
    expect(res.status(), "a learner must not be able to rewrite their own attendance").toBe(403);
    await learner.dispose();
  });

  test("LEARNER cannot read the batch attendance report", async () => {
    const learner = await apiAs("learner", { timeout: CEIL });
    const res = await GET(learner, `/api/attendance/batch/${m.batchId}/report`);
    expect(res.status()).toBe(403);
    await learner.dispose();
  });
});

test.describe("Phase 23 — attendance: missing ids", () => {
  test("reads with a nonexistent id return an empty result, not a 500", async () => {
    test.setTimeout(120_000);
    const teacher = await apiAs("teacher", { timeout: CEIL });
    for (const p of [
      `/api/attendance/class/${MISSING}`,
      `/api/attendance/student/${MISSING}`,
      `/api/attendance/batch/${MISSING}/report`,
    ]) {
      const res = await GET(teacher, p);
      expect([200, 404], `${p} returned ${res.status()}`).toContain(res.status());
    }
    await teacher.dispose();
  });

  test("mark against a nonexistent class id is 4xx, not 500", async () => {
    const teacher = await apiAs("teacher", { timeout: CEIL });
    const res = await POST(teacher, "/api/attendance/mark", {
      scheduledClassId: MISSING,
      students: [{ studentId: m.users.learner.userId, status: "present" }],
    });
    expect(res.status(), `mark on a missing class returned ${res.status()}`).toBeLessThan(500);
    await teacher.dispose();
  });

  test("PATCH a nonexistent attendance id is 404, not 500", async () => {
    const teacher = await apiAs("teacher", { timeout: CEIL });
    const res = await PATCH(teacher, `/api/attendance/${MISSING}`, { status: "present", reason: RUN });
    expect(res.status()).toBe(404);
    await teacher.dispose();
  });
});

test.describe("Phase 23 — attendance: intra-tenant ownership (F-010 defect class)", () => {
  /**
   * `/api/attendance/student/[studentId]` calls `requireAuth` and nothing else
   * (app/api/attendance/student/[studentId]/route.ts:6-8). The path id goes
   * straight into `getStudentAttendance(orgId, studentId, ...)`, which filters
   * on `{orgId, studentId}`. Nothing ties the caller to the student.
   */
  test("a LEARNER reads a DIFFERENT learner's attendance history", async () => {
    const learnerA = await apiAs("learner", { timeout: CEIL });
    const res = await GET(learnerA, `/api/attendance/student/${learnerBId}`);
    const rows = (await safeJson(res)) as AttendanceRow[];
    const n = Array.isArray(rows) ? rows.length : 0;
    console.log(`[F-P23] learner A -> /attendance/student/{learner B}: ${res.status()}, ${n} row(s)`);
    expect(
      res.status() === 403 || n === 0,
      `OWNERSHIP: learner A read ${n} of learner B's attendance records ` +
        `(status/date/notes). Route has requireAuth and no requireRoles: ` +
        `app/api/attendance/student/[studentId]/route.ts:6-8; the service filters ` +
        `on {orgId, studentId} only. Same defect class as F-010.`,
    ).toBe(true);
    await learnerA.dispose();
  });

  /**
   * `/api/attendance/class/[classId]` is likewise requireAuth-only. A class
   * roster read returns EVERY student's row for that session, so this is a
   * peer-data disclosure rather than a self-read.
   */
  test("a LEARNER reads the whole class roster's attendance", async () => {
    const learnerA = await apiAs("learner", { timeout: CEIL });
    const res = await GET(learnerA, `/api/attendance/class/${classId}`);
    const rows = (await safeJson(res)) as AttendanceRow[];
    const others = (Array.isArray(rows) ? rows : []).filter(
      (r) => idOf(r.studentId) !== m.users.learner.userId,
    );
    console.log(`[F-P23] learner A -> /attendance/class/{id}: ${res.status()}, ${others.length} peer row(s)`);
    expect(
      res.status() === 403 || others.length === 0,
      `OWNERSHIP: a learner read ${others.length} OTHER students' attendance rows for a class. ` +
        `app/api/attendance/class/[classId]/route.ts:6-8 has requireAuth only and no ` +
        `batch-membership check. Same defect class as F-010.`,
    ).toBe(true);
    await learnerA.dispose();
  });

  /**
   * The PARENT variant, mirroring F-011: no `LmsUserParent` link exists for the
   * seeded parent, and the route never consults one.
   */
  test("a PARENT with no child link reads a learner's attendance history", async () => {
    const parent = await apiAs("parent", { timeout: CEIL });
    const res = await GET(parent, `/api/attendance/student/${m.users.learner.userId}`);
    const rows = (await safeJson(res)) as AttendanceRow[];
    const n = Array.isArray(rows) ? rows.length : 0;
    console.log(`[F-P23] PARENT -> /attendance/student/{learner}: ${res.status()}, ${n} row(s)`);
    expect(
      res.status() === 403 || n === 0,
      `OWNERSHIP: an unlinked PARENT read ${n} of a learner's attendance records. ` +
        `Same defect class as F-010/F-011.`,
    ).toBe(true);
    await parent.dispose();
  });
});
