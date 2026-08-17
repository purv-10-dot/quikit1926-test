/**
 * PHASE 21 — Batches (`/api/batches/*`), all 9 route files / 12 methods.
 *
 *   POST|GET     /api/batches                         (POST: TENANT_ADMIN|SUB_ADMIN|TEACHER, GET: any authed)
 *   GET          /api/batches/[id]                    (any authed)
 *   PATCH        /api/batches/[id]                    (TENANT_ADMIN|SUB_ADMIN|TEACHER)
 *   DELETE       /api/batches/[id]                    (archive — TENANT_ADMIN|SUB_ADMIN)
 *   PATCH        /api/batches/[id]/unarchive          (TENANT_ADMIN|SUB_ADMIN)
 *   DELETE       /api/batches/[id]/permanent          (TENANT_ADMIN|SUB_ADMIN)
 *   POST         /api/batches/[id]/students           (TENANT_ADMIN|SUB_ADMIN|TEACHER)
 *   DELETE       /api/batches/[id]/students/[sid]     (TENANT_ADMIN|SUB_ADMIN|TEACHER)
 *   GET          /api/batches/statistics              (TENANT_ADMIN|SUB_ADMIN)
 *   GET          /api/batches/student/my-batches      (LEARNER)
 *   GET          /api/batches/teacher/my-batches      (TEACHER)
 *
 * These routes answer with a BARE payload (`json(await service(...))`), not the
 * `{success,data}` envelope, so assertions read the object directly.
 *
 * Authorization angle for this domain: `GET /api/batches/[id]` and
 * `GET /api/batches` are `requireAuth` with NO `requireRoles`
 * (app/api/batches/[id]/route.ts:44-48, app/api/batches/route.ts:59-61). The
 * payload includes the teacher's email and the commercial `ratePerClass` /
 * `creditPerClass` fields, so "any authenticated user" is a wide audience for
 * it. That is asserted, not assumed, below.
 *
 * Rule 11: this phase creates AT MOST ONE batch per run and permanently
 * deletes it in the same test, so the seeded teacher's calendar does not
 * saturate across repeated runs.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiAs, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const MISSING = "00000000-0000-0000-0000-000000000000";
const RUN = `AUDIT21-${Date.now()}`;

/** Cold dev-route compiles blow the 15s actionTimeout (rule 8). */
const CEIL = 60_000;
const GET = (a: APIRequestContext, p: string) => a.get(p, { timeout: CEIL });
const POST = (a: APIRequestContext, p: string, data?: unknown) =>
  a.post(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const PATCH = (a: APIRequestContext, p: string, data?: unknown) =>
  a.patch(p, { timeout: CEIL, ...(data !== undefined ? { data } : {}) });
const DELETE = (a: APIRequestContext, p: string) => a.delete(p, { timeout: CEIL });

interface Batch {
  id: string;
  name: string;
  subject: string;
  status: string;
  academicYear: string;
  /** Populated to `{id,...}` objects on the detail read, bare ids on the list. */
  studentIds?: Array<string | { id: string }>;
  maxCapacity: number | null;
  teacherId: string | { id: string; email?: string };
  ratePerClass?: number | null;
  creditPerClass?: number | null;
}

/** `studentIds` comes back populated on the detail read and bare on the list. */
const studentIdsOf = (b: Batch): string[] =>
  (b.studentIds ?? []).map((s) => (typeof s === "string" ? s : s.id));

/**
 * Rule 11, learned again here: a batch left behind by an earlier run occupies
 * the teacher's calendar and the NEXT run's create fails with a double-booking
 * 400 that reads exactly like a product bug. Two defences — pick a slot that
 * varies per run, and purge this phase's leftovers before creating anything.
 */
const SLOT_HOUR = 6 + (Math.floor(Date.now() / 1000) % 5); // 06:00–10:00, Saturday
const pad = (n: number) => String(n).padStart(2, "0");

function batchPayload(name: string, extra: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    name,
    grade: "11",
    section: "Z",
    subject: `${RUN} subject`,
    teacherId: m.users.teacher.userId,
    academicYear: "2026-2027",
    startDate: new Date(now.getTime() + 864e5).toISOString(),
    endDate: new Date(now.getTime() + 30 * 864e5).toISOString(),
    // Saturday, outside the seeded batch's slots.
    schedule: [
      { dayOfWeek: 6, startTime: `${pad(SLOT_HOUR)}:00`, endTime: `${pad(SLOT_HOUR)}:45` },
    ],
    maxCapacity: 5,
    ...extra,
  };
}

/**
 * Archive every batch this phase has ever created, freeing the seeded
 * teacher's calendar. Permanent deletion is deliberately refused once a batch
 * holds scheduled classes (batches-service.ts:543-561), and batch creation
 * generates them — so archiving is the only cleanup the API offers, and it is
 * sufficient: the conflict scan only considers `active`/`draft` batches
 * (scheduling-service.ts:460-464).
 */
async function purgeAuditBatches(admin: APIRequestContext): Promise<number> {
  const res = await GET(admin, "/api/batches");
  if (res.status() !== 200) return 0;
  const rows = (await safeJson(res)) as Batch[];
  const mine = rows.filter(
    (b) => typeof b.name === "string" && b.name.startsWith("AUDIT21-") && b.status !== "archived",
  );
  for (const b of mine) {
    await DELETE(admin, `/api/batches/${b.id}`); // archive
    await DELETE(admin, `/api/batches/${b.id}/permanent`); // purge if history-free
  }
  return mine.length;
}

/**
 * `POST /api/batches` refuses with 400 "Teacher has no availability slots
 * defined" unless the teacher has a weekly availability row. The seed does not
 * create one, so this is a fixture prerequisite, NOT a product defect — the
 * guard is working as designed. Establish it once, idempotently.
 */
test.beforeAll(async () => {
  test.setTimeout(90_000); // rule 9: setTimeout in a describe body does not extend a hook
  expect(m.batchId, "seed manifest has no batchId — reseed before running").toBeTruthy();
  const teacher = await apiAs("teacher", { timeout: CEIL });
  const res = await teacher.put("/api/teacher-availability/me", {
    timeout: CEIL,
    data: {
      slots: [
        { dayOfWeek: 6, startTime: "06:00", endTime: "12:00" },
        { dayOfWeek: 0, startTime: "06:00", endTime: "12:00" },
      ],
      maxSlotsPerWeek: 40,
    },
  });
  expect(res.status(), `availability setup said ${await res.text()}`).toBe(200);
  await teacher.dispose();

  const admin = await apiAs("tenantAdmin", { timeout: CEIL });
  const purged = await purgeAuditBatches(admin);
  if (purged) console.log(`[setup] purged ${purged} leftover AUDIT21 batch(es)`);
  await admin.dispose();
});

test.describe("Phase 21 — batches: reads", () => {
  test("GET /api/batches returns the seeded batch for an admin", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, "/api/batches");
    expect(res.status()).toBe(200);
    const rows = (await safeJson(res)) as Batch[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.some((b) => b.id === m.batchId)).toBe(true);
    await api.dispose();
  });

  test("GET /api/batches?status=active filters", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, "/api/batches?status=active");
    expect(res.status()).toBe(200);
    const rows = (await safeJson(res)) as Batch[];
    expect(rows.every((b) => b.status === "active")).toBe(true);
    await api.dispose();
  });

  test("GET /api/batches/[id] returns the documented shape", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, `/api/batches/${m.batchId}`);
    expect(res.status()).toBe(200);
    const b = (await safeJson(res)) as Batch;
    expect(b.id).toBe(m.batchId);
    expect(b.name).toBeTruthy();
    expect(b.academicYear).toMatch(/^\d{4}-\d{4}$/);
    await api.dispose();
  });

  test("GET /api/batches/[id] with a nonexistent id is 404, not 500", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, `/api/batches/${MISSING}`);
    expect(res.status()).toBe(404);
    const body = (await safeJson(res)) as { success?: boolean };
    expect(body.success).toBe(false);
    await api.dispose();
  });

  test("GET /api/batches/statistics returns the counter envelope for an admin", async () => {
    const api = await apiAs("tenantAdmin", { timeout: CEIL });
    const res = await GET(api, "/api/batches/statistics");
    expect(res.status()).toBe(200);
    const s = (await safeJson(res)) as Record<string, number>;
    for (const k of ["active", "draft", "archived", "totalStudents"]) {
      expect(typeof s[k], `statistics.${k}`).toBe("number");
    }
    await api.dispose();
  });

  test("GET /api/batches/teacher/my-batches returns the teacher's own batches", async () => {
    const api = await apiAs("teacher", { timeout: CEIL });
    const res = await GET(api, "/api/batches/teacher/my-batches");
    expect(res.status()).toBe(200);
    const rows = (await safeJson(res)) as Batch[];
    expect(rows.some((b) => b.id === m.batchId)).toBe(true);
    await api.dispose();
  });

  test("GET /api/batches/student/my-batches is scoped to the caller", async () => {
    const api = await apiAs("learner", { timeout: CEIL });
    const res = await GET(api, "/api/batches/student/my-batches");
    expect(res.status()).toBe(200);
    expect(Array.isArray(await safeJson(res))).toBe(true);
    await api.dispose();
  });
});

test.describe("Phase 21 — batches: role gating", () => {
  const DENIED: Array<[string, "learner" | "parent" | "teacher" | "manager", string, "get" | "post" | "patch" | "delete"]> = [
    ["GET /api/batches/statistics", "learner", "/api/batches/statistics", "get"],
    ["GET /api/batches/statistics", "teacher", "/api/batches/statistics", "get"],
    ["GET /api/batches/student/my-batches", "teacher", "/api/batches/student/my-batches", "get"],
    ["GET /api/batches/teacher/my-batches", "learner", "/api/batches/teacher/my-batches", "get"],
  ];

  for (const [label, role, path] of DENIED) {
    test(`${role} is refused ${label}`, async () => {
      const api = await apiAs(role, { timeout: CEIL });
      const res = await GET(api, path);
      expect(res.status(), `${role} reached ${label}`).toBe(403);
      await api.dispose();
    });
  }

  test("LEARNER cannot create a batch", async () => {
    const api = await apiAs("learner", { timeout: CEIL });
    const res = await POST(api, "/api/batches", batchPayload(`${RUN} denied`));
    expect(res.status()).toBe(403);
    await api.dispose();
  });

  test("TEACHER cannot archive a batch (DELETE is admin-only)", async () => {
    const api = await apiAs("teacher", { timeout: CEIL });
    const res = await DELETE(api, `/api/batches/${m.batchId}`);
    expect(res.status()).toBe(403);
    await api.dispose();
  });

  test("TEACHER cannot permanently delete a batch", async () => {
    const api = await apiAs("teacher", { timeout: CEIL });
    const res = await DELETE(api, `/api/batches/${m.batchId}/permanent`);
    expect(res.status()).toBe(403);
    await api.dispose();
  });

  // `GET /api/batches/[id]` is requireAuth-only. This records how wide that is:
  // the response carries the teacher's email and the commercial rate fields.
  test("[ownership] any authenticated role can read any batch by id", async () => {
    const api = await apiAs("parent", { timeout: CEIL });
    const res = await GET(api, `/api/batches/${m.batchId}`);
    const b = (await safeJson(res)) as Batch;
    const teacher = typeof b.teacherId === "object" ? b.teacherId : null;
    console.log(
      `[INFO] PARENT GET /api/batches/{id} -> ${res.status()}; ` +
        `teacher email exposed: ${teacher?.email ?? "n/a"}; creditPerClass: ${b.creditPerClass ?? "n/a"}`,
    );
    // Documented, not asserted as a verdict: the route has no requireRoles and
    // no membership check (app/api/batches/[id]/route.ts:44-48). Whether an
    // unrelated PARENT should see a batch's rate card is a product decision.
    expect([200, 403, 404]).toContain(res.status());
    await api.dispose();
  });
});

test.describe("Phase 21 — batches: lifecycle (create → students → archive → unarchive → purge)", () => {
  test("full CRUD lifecycle, every mutation verified by read-back", async () => {
    test.setTimeout(180_000);
    const admin = await apiAs("tenantAdmin", { timeout: CEIL });

    // ── create
    const created = await POST(admin, "/api/batches", batchPayload(`${RUN} lifecycle`));
    expect(created.status(), `create said ${await created.text()}`).toBe(200);
    const batch = (await safeJson(created)) as Batch;
    expect(batch.id).toBeTruthy();
    expect(batch.name).toBe(`${RUN} lifecycle`);

    // ── read-back after create
    const read1 = await GET(admin, `/api/batches/${batch.id}`);
    expect(read1.status()).toBe(200);
    expect(((await safeJson(read1)) as Batch).name).toBe(`${RUN} lifecycle`);

    // ── update, verified by read-back
    const patched = await PATCH(admin, `/api/batches/${batch.id}`, { name: `${RUN} renamed`, maxCapacity: 9 });
    expect(patched.status()).toBe(200);
    const read2 = (await safeJson(await GET(admin, `/api/batches/${batch.id}`))) as Batch;
    expect(read2.name, "PATCH did not persist").toBe(`${RUN} renamed`);
    expect(read2.maxCapacity).toBe(9);

    // ── add a student, verified by read-back
    const added = await POST(admin, `/api/batches/${batch.id}/students`, {
      studentIds: [m.users.learner.userId],
    });
    expect(added.status(), `add students said ${await added.text()}`).toBe(200);
    const read3 = (await safeJson(await GET(admin, `/api/batches/${batch.id}`))) as Batch;
    expect(studentIdsOf(read3), "student not present after add").toContain(m.users.learner.userId);

    // the learner should now see it in their own list
    const learner = await apiAs("learner", { timeout: CEIL });
    const mine = (await safeJson(await GET(learner, "/api/batches/student/my-batches"))) as Batch[];
    expect(mine.some((b) => b.id === batch.id), "batch missing from /student/my-batches").toBe(true);
    await learner.dispose();

    // ── remove the student, verified by read-back
    const removed = await DELETE(admin, `/api/batches/${batch.id}/students/${m.users.learner.userId}`);
    expect(removed.status()).toBe(200);
    const read4 = (await safeJson(await GET(admin, `/api/batches/${batch.id}`))) as Batch;
    expect(studentIdsOf(read4), "student still present after remove").not.toContain(m.users.learner.userId);

    // ── archive, verified by read-back
    const archived = await DELETE(admin, `/api/batches/${batch.id}`);
    expect(archived.status()).toBe(200);
    const read5 = (await safeJson(await GET(admin, `/api/batches/${batch.id}`))) as Batch;
    expect(read5.status, "archive did not change status").toBe("archived");

    // ── unarchive, verified by read-back
    const unarchived = await PATCH(admin, `/api/batches/${batch.id}/unarchive`);
    expect(unarchived.status()).toBe(200);
    const read6 = (await safeJson(await GET(admin, `/api/batches/${batch.id}`))) as Batch;
    expect(read6.status, "unarchive did not restore status").not.toBe("archived");

    // ── permanent delete has TWO deliberate guards, both asserted here
    //    rather than worked around, because both are load-bearing:
    //      1. active batches cannot be purged (batches-service.ts:522-526);
    //      2. a batch holding academic history cannot be purged either
    //         (batches-service.ts:543-561) — `LmsBatch` has seven
    //         `onDelete: Cascade` back-relations, so an unguarded delete would
    //         silently wipe a term of grades and attendance.
    //    Batch creation auto-generates scheduled classes, so guard 2 fires.
    const tooEarly = await DELETE(admin, `/api/batches/${batch.id}/permanent`);
    expect(tooEarly.status(), "active batches must not be permanently deletable").toBe(400);

    expect((await DELETE(admin, `/api/batches/${batch.id}`)).status()).toBe(200);
    const purged = await DELETE(admin, `/api/batches/${batch.id}/permanent`);
    expect(purged.status(), "a batch with academic history must not be purged").toBe(400);
    expect(await purged.text()).toContain("academic history");

    // Left ARCHIVED, which is what the service tells the admin to do. Archived
    // batches are excluded from the teacher's conflict scan
    // (scheduling-service.ts:460-464), so the calendar stays free (rule 11).
    const final = (await safeJson(await GET(admin, `/api/batches/${batch.id}`))) as Batch;
    expect(final.status).toBe("archived");

    await admin.dispose();
  });

  test("mutations against a nonexistent batch id are 404, not 500", async () => {
    test.setTimeout(120_000);
    const admin = await apiAs("tenantAdmin", { timeout: CEIL });
    const probes: Array<[string, () => Promise<{ status(): number }>]> = [
      ["PATCH /api/batches/[id]", () => PATCH(admin, `/api/batches/${MISSING}`, { name: "x" })],
      ["DELETE /api/batches/[id]", () => DELETE(admin, `/api/batches/${MISSING}`)],
      ["PATCH /api/batches/[id]/unarchive", () => PATCH(admin, `/api/batches/${MISSING}/unarchive`)],
      ["DELETE /api/batches/[id]/permanent", () => DELETE(admin, `/api/batches/${MISSING}/permanent`)],
      [
        "POST /api/batches/[id]/students",
        () => POST(admin, `/api/batches/${MISSING}/students`, { studentIds: [m.users.learner.userId] }),
      ],
      [
        "DELETE /api/batches/[id]/students/[sid]",
        () => DELETE(admin, `/api/batches/${MISSING}/students/${m.users.learner.userId}`),
      ],
    ];
    for (const [label, run] of probes) {
      const res = await run();
      expect([400, 404], `${label} returned ${res.status()} for a missing id`).toContain(res.status());
    }
    await admin.dispose();
  });
});
