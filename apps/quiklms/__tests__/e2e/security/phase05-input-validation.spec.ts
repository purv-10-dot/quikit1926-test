/**
 * PHASE 05 — Input validation on mutating endpoints.
 *
 * Every probe here runs as `tenantAdmin`, deliberately: authentication and
 * authorization were settled in phases 02 and 03, so anything that goes wrong
 * from here is a validation defect and not an access-control one. Being past
 * the guard is the whole point — it is the only way to reach the parse step.
 *
 * The contract under test comes from lib/validation.ts + lib/http.ts: a route
 * calls `parseBody(req, schema)`, zod throws, and `toErrorResponse`
 * (lib/http.ts:84-95) converts the ZodError into a 400 carrying a
 * `validationErrors[]` array. So for malformed input the expected outcome is
 * exact and machine-checkable.
 *
 * A 500 is the finding. It means the bad value flowed past the schema into a
 * service and died somewhere downstream — usually in Postgres. That matters
 * beyond tidiness: the client gets no field-level feedback, the failure is
 * logged as an unhandled error (lib/http.ts:128) rather than a client mistake,
 * and any code between the parse and the crash has already run — for several
 * of these routes that includes writes.
 *
 * Four malformed shapes are exercised, because they fail at different layers:
 *   missing required field  — caught by zod if the field is declared
 *   wrong primitive type    — caught by zod only if the type is declared
 *   oversized string        — caught only if a max length is declared (rarely)
 *   null where object/array — the classic gap: `.optional()` permits undefined
 *                             but NOT null, and JSON clients send null
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiAs, safeJson, type ErrorEnvelope } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const NO_SUCH_ID = "00000000-0000-4000-8000-000000000000";

type Method = "POST" | "PATCH" | "PUT";

interface Case {
  label: string;
  method: Method;
  url: string;
  body: unknown;
  /** Which malformed shape this exercises — reported in the failure message. */
  kind: "missing" | "wrong-type" | "oversized" | "null-object";
}

/**
 * ~24 cases across 20 endpoints, all of which call `parseBody` with a zod
 * schema and all of which TENANT_ADMIN is authorized to reach.
 */
const CASES: Case[] = [
  // --- Schemas that declare real required fields. These SHOULD 400 cleanly.
  { label: "POST /api/groups — missing required name", method: "POST", url: "/api/groups", body: {}, kind: "missing" },
  { label: "POST /api/groups — name is a number", method: "POST", url: "/api/groups", body: { name: 12345 }, kind: "wrong-type" },
  { label: "POST /api/groups — memberIds null instead of array", method: "POST", url: "/api/groups", body: { name: "audit", memberIds: null }, kind: "null-object" },
  { label: "POST /api/groups — 100k-character name", method: "POST", url: "/api/groups", body: { name: "A".repeat(100_000) }, kind: "oversized" },

  { label: "POST /api/batches — missing every required field", method: "POST", url: "/api/batches", body: {}, kind: "missing" },
  { label: "POST /api/batches — numbers where strings are declared", method: "POST", url: "/api/batches", body: { name: 1, subject: 2, teacherId: 3, academicYear: 4, startDate: 5, endDate: 6, schedule: [] }, kind: "wrong-type" },
  { label: "POST /api/batches — schedule null instead of array", method: "POST", url: "/api/batches", body: { name: "a", subject: "b", teacherId: "c", academicYear: "2025-2026", startDate: "2025-01-01", endDate: "2025-06-01", schedule: null }, kind: "null-object" },

  { label: "POST /api/homework — missing title/batchId/dueDate", method: "POST", url: "/api/homework", body: {}, kind: "missing" },
  { label: "POST /api/homework — numbers where strings are declared", method: "POST", url: "/api/homework", body: { title: 5, batchId: 5, dueDate: 5 }, kind: "wrong-type" },
  { label: "POST /api/homework — resourceLinks null instead of array", method: "POST", url: "/api/homework", body: { title: "a", batchId: m.batchId ?? NO_SUCH_ID, dueDate: "2026-01-01", resourceLinks: null }, kind: "null-object" },

  { label: "POST /api/credits/packages — missing all fields", method: "POST", url: "/api/credits/packages", body: {}, kind: "missing" },
  { label: "POST /api/credits/packages — credits as a string", method: "POST", url: "/api/credits/packages", body: { name: "audit", credits: "ten", price: "free", validityMonths: "one" }, kind: "wrong-type" },

  { label: "POST /api/course-assignments/assign — missing courseId/targetType", method: "POST", url: "/api/course-assignments/assign", body: {}, kind: "missing" },
  { label: "POST /api/course-assignments/assign — targetIds null instead of array", method: "POST", url: "/api/course-assignments/assign", body: { courseId: m.courses.published, targetType: "USER", targetIds: null }, kind: "null-object" },
  { label: "POST /api/course-assignments/assign — targetType outside its enum", method: "POST", url: "/api/course-assignments/assign", body: { courseId: m.courses.published, targetType: "EVERYONE", targetIds: [] }, kind: "wrong-type" },

  { label: "POST /api/analytics/track — missing eventType", method: "POST", url: "/api/analytics/track", body: {}, kind: "missing" },
  { label: "POST /api/analytics/track — eventType as an object", method: "POST", url: "/api/analytics/track", body: { eventType: { nested: true } }, kind: "wrong-type" },

  { label: "POST /api/academic-config/sections — missing name", method: "POST", url: "/api/academic-config/sections", body: {}, kind: "missing" },
  { label: "POST /api/academic-config/subjects — missing name", method: "POST", url: "/api/academic-config/subjects", body: {}, kind: "missing" },
  { label: "POST /api/academic-calendar — missing required fields", method: "POST", url: "/api/academic-calendar", body: {}, kind: "missing" },

  { label: "POST /api/assessments — missing moduleId", method: "POST", url: "/api/assessments", body: {}, kind: "missing" },
  { label: "POST /api/assessments — moduleId null", method: "POST", url: "/api/assessments", body: { moduleId: null }, kind: "null-object" },

  { label: "POST /api/attendance/mark — missing required fields", method: "POST", url: "/api/attendance/mark", body: {}, kind: "missing" },
  { label: "POST /api/meetings — missing required fields", method: "POST", url: "/api/meetings", body: {}, kind: "missing" },
  { label: "POST /api/courses/modules — missing required fields", method: "POST", url: "/api/courses/modules", body: {}, kind: "missing" },
  { label: "POST /api/courses/lessons — missing required fields", method: "POST", url: "/api/courses/lessons", body: {}, kind: "missing" },
  { label: "PATCH /api/batches/[id] — name as a number", method: "PATCH", url: `/api/batches/${m.batchId ?? NO_SUCH_ID}`, body: { name: 999 }, kind: "wrong-type" },

  // --- Schemas that are `z.object({}).passthrough()` — i.e. they import zod
  //     and call parseBody, but the schema constrains NOTHING. Included on
  //     purpose: they are the cases most likely to fall through to a 500,
  //     which is exactly what this phase is looking for.
  { label: "POST /api/courses — empty body against a passthrough schema", method: "POST", url: "/api/courses", body: {}, kind: "missing" },
  { label: "POST /api/exams — empty body against a passthrough schema", method: "POST", url: "/api/exams", body: {}, kind: "missing" },
  { label: "POST /api/certificates — empty body against a passthrough schema", method: "POST", url: "/api/certificates", body: {}, kind: "missing" },
  { label: "POST /api/master-courses — empty body", method: "POST", url: "/api/master-courses", body: {}, kind: "missing" },
];

async function send(api: APIRequestContext, c: Case) {
  const opts = { data: c.body as Record<string, unknown>, timeout: 60_000, maxRedirects: 0 };
  if (c.method === "POST") return api.post(c.url, opts);
  if (c.method === "PATCH") return api.patch(c.url, opts);
  return api.put(c.url, opts);
}

test.describe("Phase 05 — malformed input must 400, never 500", () => {
  for (const c of CASES) {
    test(`validation — ${c.label}`, async () => {
      test.setTimeout(90_000);
      const api = await apiAs("tenantAdmin");
      const res = await send(api, c);
      const status = res.status();
      const body = (await safeJson(res)) as ErrorEnvelope;
      await api.dispose();

      // A 500 means the malformed value reached a service or the database.
      expect(
        status,
        `UNHANDLED ERROR (${c.kind}) on ${c.label}: malformed input produced HTTP ${status} ` +
          `instead of a 400. The value passed the zod schema and failed downstream — ` +
          `see lib/http.ts:128, which logs this as an unhandled error rather than a client fault. ` +
          `error=${body?.error ?? "?"}`,
      ).toBeLessThan(500);

      // 404 is legitimate for the [id] cases: the row genuinely may not exist,
      // and the route is entitled to check existence before shape.
      if (status === 404) return;

      expect(
        status,
        `EXPECTED 400 (${c.kind}) on ${c.label}, got ${status}. Either the schema does not ` +
          `constrain this field, or the route accepted the malformed value outright.`,
      ).toBe(400);

      expect(
        typeof body?.error === "string" && body.error.length > 0,
        `MISSING error message on ${c.label} — a 400 from zod must carry a readable message ` +
          `(lib/http.ts). Got: ${JSON.stringify(body).slice(0, 200)}`,
      ).toBe(true);
    });
  }
});

test.describe("Phase 05 — injection-shaped strings", () => {
  // These assert absence of a crash, not absence of a vulnerability. Prisma
  // parameterises every query, so a SQL payload should be an ordinary string;
  // the risk being probed is a route that concatenates one into `$queryRaw`,
  // which would surface as a 500 carrying a Postgres syntax error.
  const PAYLOADS: Array<{ name: string; value: string }> = [
    { name: "SQL injection", value: "'; DROP TABLE lms_groups; -- " },
    { name: "SQL boolean tautology", value: "' OR '1'='1" },
    { name: "XSS script tag", value: "<script>alert('xss')</script>" },
    { name: "XSS attribute breakout", value: '"><img src=x onerror=alert(1)>' },
  ];

  for (const p of PAYLOADS) {
    test(`${p.name} in a text field is handled safely`, async () => {
      test.setTimeout(90_000);
      const api = await apiAs("tenantAdmin");

      // `/api/groups` takes a plain `name: z.string().min(1)`, so the payload
      // reaches the database as a value rather than being rejected on shape —
      // which is what makes it a meaningful probe of the storage path.
      const res = await api.post("/api/groups", {
        data: { name: p.value, description: "phase05 audit probe" },
        timeout: 60_000,
      });
      const status = res.status();
      const body = (await safeJson(res)) as { data?: { name?: string }; message?: string };
      await api.dispose();

      expect(
        status,
        `${p.name} produced HTTP ${status}. A 500 here would indicate the string reached a ` +
          `raw query or an unescaped sink. message=${body?.message ?? "?"}`,
      ).toBeLessThan(500);

      // If it was stored, it must round-trip byte-for-byte. Silent mangling
      // would suggest an escaping/stripping layer, and a value that came back
      // *changed* would be worth understanding.
      if (status < 300 && body?.data?.name !== undefined) {
        expect(
          body.data.name,
          `${p.name} was altered in storage — expected verbatim round-trip`,
        ).toBe(p.value);
      }
    });
  }
});
