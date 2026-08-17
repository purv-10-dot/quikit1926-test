/**
 * PHASE 03 — Role-based access control matrix.
 *
 * Phase 02 proves a route rejects *anonymous* callers. That is the easy half.
 * The harder question is whether an AUTHENTICATED user of the wrong role is
 * refused — and here the platform gives no help: route-group layouts enforce
 * nothing (CONVENTIONS), `middleware.ts` skips `/api/*`, and ~90 of the 348
 * routes call `requireAuth` with no `requireRoles` at all. Authorization is
 * therefore a per-route convention, and conventions get forgotten.
 *
 * Method: for each endpoint below, the ALLOWED list is transcribed from the
 * literal `requireRoles(actor, [...])` call in that route file — it is the
 * source of truth, not a guess about what the endpoint *should* do. Then all 7
 * seeded roles are fired at it:
 *
 *   allowed role    → anything EXCEPT 403. (400/404/409 are fine: the guard let
 *                     them through and the request failed on its merits, which
 *                     is what we are asserting.)
 *   disallowed role → exactly 403.
 *
 * The valuable finding is a disallowed role that gets 200 — real privilege
 * escalation. The second finding is a disallowed role getting 400/500 instead
 * of 403, which means the handler parsed input or touched the database BEFORE
 * checking authorization.
 *
 * Note ADMIN is NOT implicitly allowed anywhere: `requireRoles` is a flat
 * membership test (lib/auth/context.ts:123), so a guard listing only
 * TENANT_ADMIN/SUB_ADMIN genuinely 403s the super admin. That is intentional
 * here and the matrix encodes it rather than special-casing it.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiAs, safeJson } from "../fixtures/api";
import { ALL_ROLES, loadManifest, type RoleKey } from "../fixtures/auth";

const m = loadManifest();

/** Maps the manifest's role keys to the LmsUserRole strings the guards use. */
const LMS_ROLE: Record<RoleKey, string> = {
  superAdmin: "ADMIN",
  tenantAdmin: "TENANT_ADMIN",
  subAdmin: "SUB_ADMIN",
  manager: "MANAGER",
  teacher: "TEACHER",
  parent: "PARENT",
  learner: "LEARNER",
};

const LEARNER_ID = m.users.learner.lmsUserId;
const NO_SUCH_ID = "00000000-0000-4000-8000-000000000000";

interface Probe {
  label: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  /** Verbatim from the route's requireRoles(...) call. */
  allowed: string[];
  /** Body for mutating probes — deliberately minimal; we assert on the guard, not the payload. */
  body?: Record<string, unknown>;
}

/**
 * ~48 high-value, role-gated endpoints. Chosen for blast radius: tenant
 * administration, user management, exam integrity, money (payouts/credits),
 * and the four single-role endpoints where a leak would cross the
 * learner/teacher/manager boundary outright.
 */
const PROBES: Probe[] = [
  // --- Tenant administration: ADMIN-only surface. A TENANT_ADMIN
  //     reaching these would be a cross-tenant platform takeover.
  { label: "GET /api/tenants", method: "GET", url: "/api/tenants", allowed: ["ADMIN"] },
  { label: "POST /api/tenants", method: "POST", url: "/api/tenants", allowed: ["ADMIN"], body: {} },
  { label: "GET /api/tenants/[id]", method: "GET", url: `/api/tenants/${m.orgId}`, allowed: ["ADMIN"] },
  { label: "PATCH /api/tenants/[id]", method: "PATCH", url: `/api/tenants/${m.orgId}`, allowed: ["ADMIN"], body: {} },
  { label: "DELETE /api/tenants/[id]", method: "DELETE", url: `/api/tenants/${NO_SUCH_ID}`, allowed: ["ADMIN"] },
  { label: "POST /api/tenants/onboard", method: "POST", url: "/api/tenants/onboard", allowed: ["ADMIN"], body: {} },
  { label: "POST /api/tenants/create-admin-credentials", method: "POST", url: "/api/tenants/create-admin-credentials", allowed: ["ADMIN"], body: {} },
  { label: "GET /api/tenants/usage", method: "GET", url: "/api/tenants/usage", allowed: ["ADMIN", "TENANT_ADMIN", "SUB_ADMIN"] },
  { label: "GET /api/tenants/storage-check", method: "GET", url: "/api/tenants/storage-check", allowed: ["ADMIN", "TENANT_ADMIN", "SUB_ADMIN", "MANAGER"] },
  { label: "PATCH /api/tenants/[id]/branding", method: "PATCH", url: `/api/tenants/${m.orgId}/branding`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "ADMIN"], body: {} },
  { label: "GET /api/tenants/[id]/video-config", method: "GET", url: `/api/tenants/${m.orgId}/video-config`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "ADMIN"] },
  { label: "PATCH /api/tenants/[id]/language-config", method: "PATCH", url: `/api/tenants/${m.orgId}/language-config`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "ADMIN"], body: {} },

  // --- User management. Privilege *granting* endpoints matter most: a
  //     SUB_ADMIN who can promote sub-admins can escalate laterally forever.
  { label: "GET /api/users", method: "GET", url: "/api/users", allowed: ["ADMIN", "TENANT_ADMIN", "SUB_ADMIN"] },
  { label: "PATCH /api/users/[id]", method: "PATCH", url: `/api/users/${LEARNER_ID}`, allowed: ["ADMIN", "TENANT_ADMIN", "SUB_ADMIN"], body: {} },
  { label: "PATCH /api/users/[id]/toggle-active", method: "PATCH", url: `/api/users/${LEARNER_ID}/toggle-active`, allowed: ["ADMIN", "TENANT_ADMIN", "SUB_ADMIN"], body: {} },
  { label: "POST /api/users/by-ids", method: "POST", url: "/api/users/by-ids", allowed: ["ADMIN", "TENANT_ADMIN", "SUB_ADMIN", "MANAGER", "TEACHER"], body: { ids: [LEARNER_ID] } },

  // --- Exam authoring. A LEARNER who can write here can rewrite the test
  //     they are about to sit.
  { label: "GET /api/exams", method: "GET", url: "/api/exams", allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER"] },
  { label: "POST /api/exams", method: "POST", url: "/api/exams", allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER"], body: {} },
  { label: "GET /api/exams/[id]", method: "GET", url: `/api/exams/${NO_SUCH_ID}`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER", "LEARNER"] },
  { label: "PUT /api/exams/[id]", method: "PUT", url: `/api/exams/${NO_SUCH_ID}`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER"], body: {} },
  { label: "POST /api/exams/[id]/publish", method: "POST", url: `/api/exams/${NO_SUCH_ID}/publish`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER"], body: {} },
  { label: "POST /api/exams/[id]/publish-results", method: "POST", url: `/api/exams/${NO_SUCH_ID}/publish-results`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER"], body: {} },
  { label: "GET /api/exams/student (LEARNER-only)", method: "GET", url: "/api/exams/student", allowed: ["LEARNER"] },

  // --- Exam sessions. The sit/grade split is the integrity boundary: a
  //     LEARNER reaching /evaluate or /void could grade or erase their own attempt.
  { label: "POST /api/exam-sessions/[id]/start (LEARNER-only)", method: "POST", url: `/api/exam-sessions/${NO_SUCH_ID}/start`, allowed: ["LEARNER"], body: {} },
  { label: "GET /api/exam-sessions/[id]/status (LEARNER-only)", method: "GET", url: `/api/exam-sessions/${NO_SUCH_ID}/status`, allowed: ["LEARNER"] },
  { label: "GET /api/exam-sessions/[id]/result (LEARNER-only)", method: "GET", url: `/api/exam-sessions/${NO_SUCH_ID}/result`, allowed: ["LEARNER"] },
  { label: "PATCH /api/exam-sessions/[id]/save (LEARNER-only)", method: "PATCH", url: `/api/exam-sessions/${NO_SUCH_ID}/save`, allowed: ["LEARNER"], body: {} },
  { label: "PATCH /api/exam-sessions/[id]/evaluate", method: "PATCH", url: `/api/exam-sessions/${NO_SUCH_ID}/evaluate`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER"], body: {} },
  { label: "POST /api/exam-sessions/[id]/void", method: "POST", url: `/api/exam-sessions/${NO_SUCH_ID}/void`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER"], body: {} },
  { label: "GET /api/exam-sessions/exam/[examId]/analytics", method: "GET", url: `/api/exam-sessions/exam/${NO_SUCH_ID}/analytics`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER"] },
  { label: "GET /api/exam-sessions/exam/[examId]/submissions", method: "GET", url: `/api/exam-sessions/exam/${NO_SUCH_ID}/submissions`, allowed: ["TENANT_ADMIN", "SUB_ADMIN", "TEACHER"] },
  { label: "GET /api/exam-sessions/exam/[examId]/my-session (LEARNER-only)", method: "GET", url: `/api/exam-sessions/exam/${NO_SUCH_ID}/my-session`, allowed: ["LEARNER"] },
  { label: "GET /api/exam-sessions/student/[studentId]/results", method: "GET", url: `/api/exam-sessions/student/${LEARNER_ID}/results`, allowed: ["PARENT", "TENANT_ADMIN", "SUB_ADMIN", "TEACHER"] },

  // --- Money. Payout approval is the classic segregation-of-duties target:
  //     the TEACHER being paid must not be able to approve their own payout.
  { label: "GET /api/payouts", method: "GET", url: "/api/payouts", allowed: ["TENANT_ADMIN", "SUB_ADMIN"] },
  { label: "GET /api/payouts/[id]", method: "GET", url: `/api/payouts/${NO_SUCH_ID}`, allowed: ["ADMIN", "TENANT_ADMIN", "SUB_ADMIN", "MANAGER", "TEACHER"] },
  { label: "GET /api/payouts/teacher (TEACHER-only)", method: "GET", url: "/api/payouts/teacher", allowed: ["TEACHER"] },
  { label: "POST /api/payouts/generate", method: "POST", url: "/api/payouts/generate", allowed: ["TENANT_ADMIN", "SUB_ADMIN"], body: {} },
  { label: "PATCH /api/payouts/[id]/approve", method: "PATCH", url: `/api/payouts/${NO_SUCH_ID}/approve`, allowed: ["TENANT_ADMIN", "SUB_ADMIN"], body: {} },
  { label: "PATCH /api/payouts/[id]/pay", method: "PATCH", url: `/api/payouts/${NO_SUCH_ID}/pay`, allowed: ["TENANT_ADMIN", "SUB_ADMIN"], body: {} },
  { label: "POST /api/payouts/[id]/adjustment", method: "POST", url: `/api/payouts/${NO_SUCH_ID}/adjustment`, allowed: ["TENANT_ADMIN", "SUB_ADMIN"], body: {} },

  // --- Credits. `allocate` mints balance; the my-* endpoints are the
  //     consumer side and must NOT be reachable by staff roles.
  // GET and POST on this path have DIFFERENT guards: the POST calls
  // requireRoles(['TENANT_ADMIN','SUB_ADMIN']) but the GET calls only
  // requireAuth — "any authed user", per its own comment
  // (app/api/credits/packages/route.ts:16). It is one of the ~90 routes with no
  // role guard at all. Reading a credit price list is a reasonable thing for a
  // LEARNER or PARENT to do (they are the ones buying credits) and the query is
  // scoped by `actor.orgId`, so this is recorded rather than asserted against.
  { label: "GET /api/credits/packages (no role guard by design)", method: "GET", url: "/api/credits/packages", allowed: [...Object.values(LMS_ROLE)] },
  { label: "POST /api/credits/packages", method: "POST", url: "/api/credits/packages", allowed: ["TENANT_ADMIN", "SUB_ADMIN"], body: {} },
  { label: "POST /api/credits/allocate", method: "POST", url: "/api/credits/allocate", allowed: ["TENANT_ADMIN", "SUB_ADMIN"], body: {} },
  { label: "POST /api/credits/refund", method: "POST", url: "/api/credits/refund", allowed: ["TENANT_ADMIN", "SUB_ADMIN"], body: {} },
  { label: "GET /api/credits/balance/[id]", method: "GET", url: `/api/credits/balance/${NO_SUCH_ID}`, allowed: ["TENANT_ADMIN", "SUB_ADMIN"] },
  { label: "GET /api/credits/student/[studentId]/balance", method: "GET", url: `/api/credits/student/${LEARNER_ID}/balance`, allowed: ["TENANT_ADMIN", "SUB_ADMIN"] },
  { label: "GET /api/credits/my-balance", method: "GET", url: "/api/credits/my-balance", allowed: ["PARENT", "LEARNER"] },
  { label: "GET /api/credits/my-transactions", method: "GET", url: "/api/credits/my-transactions", allowed: ["PARENT", "LEARNER"] },

  // --- MANAGER-only corporate surface. Every one of these exposes another
  //     employee's training record; no other role should touch them.
  { label: "GET /api/manager/team-list (MANAGER-only)", method: "GET", url: "/api/manager/team-list", allowed: ["MANAGER"] },
  { label: "GET /api/manager/team-stats (MANAGER-only)", method: "GET", url: "/api/manager/team-stats", allowed: ["MANAGER"] },
  { label: "GET /api/manager/learner-courses (MANAGER-only)", method: "GET", url: "/api/manager/learner-courses", allowed: ["MANAGER"] },
  { label: "GET /api/manager/learner-detail/[userId] (MANAGER-only)", method: "GET", url: `/api/manager/learner-detail/${LEARNER_ID}`, allowed: ["MANAGER"] },
  { label: "POST /api/manager/nudge (MANAGER-only)", method: "POST", url: "/api/manager/nudge", allowed: ["MANAGER"], body: {} },
  { label: "POST /api/manager/bulk-assign (MANAGER-only)", method: "POST", url: "/api/manager/bulk-assign", allowed: ["MANAGER"], body: {} },
  { label: "PATCH /api/manager/manual-override (MANAGER-only)", method: "PATCH", url: "/api/manager/manual-override", allowed: ["MANAGER"], body: {} },

  // --- Single-role endpoints called out as high-value in the audit brief.
  { label: "GET /api/batches/student/my-batches (LEARNER-only)", method: "GET", url: "/api/batches/student/my-batches", allowed: ["LEARNER"] },
  { label: "GET /api/batches/teacher/my-batches (TEACHER-only)", method: "GET", url: "/api/batches/teacher/my-batches", allowed: ["TEACHER"] },
  { label: "GET /api/teacher-availability/me (TEACHER-only)", method: "GET", url: "/api/teacher-availability/me", allowed: ["TEACHER"] },
  { label: "PUT /api/teacher-availability/me (TEACHER-only)", method: "PUT", url: "/api/teacher-availability/me", allowed: ["TEACHER"], body: {} },
  { label: "POST /api/homework/[id]/submit (LEARNER-only)", method: "POST", url: `/api/homework/${NO_SUCH_ID}/submit`, allowed: ["LEARNER"], body: {} },
  { label: "GET /api/homework/teacher", method: "GET", url: "/api/homework/teacher", allowed: ["TEACHER", "TENANT_ADMIN", "SUB_ADMIN"] },
  { label: "GET /api/homework/student/submissions", method: "GET", url: "/api/homework/student/submissions", allowed: ["LEARNER", "PARENT"] },
  { label: "PATCH /api/homework/submissions/[id]/grade", method: "PATCH", url: `/api/homework/submissions/${NO_SUCH_ID}/grade`, allowed: ["TEACHER", "TENANT_ADMIN", "SUB_ADMIN"], body: {} },
];

async function fireOnce(api: APIRequestContext, p: Probe) {
  const opts = { data: p.body ?? {}, timeout: 60_000, maxRedirects: 0 };
  switch (p.method) {
    case "GET": return api.get(p.url, { timeout: 60_000, maxRedirects: 0 });
    case "POST": return api.post(p.url, opts);
    case "PATCH": return api.patch(p.url, opts);
    case "PUT": return api.put(p.url, opts);
    case "DELETE": return api.delete(p.url, opts);
  }
}

/**
 * Four Playwright workers each firing 7 sequential requests saturate the single
 * dev server, which shows up as torn sockets and transient 500s from a starved
 * connection pool. Both are harness artifacts, so each gets exactly one retry —
 * a defect that only appears under load is not a reproducible authorization
 * result, and reporting it as one would be a false finding.
 */
async function fire(api: APIRequestContext, p: Probe) {
  try {
    const res = await fireOnce(api, p);
    if (res.status() < 500) return res;
  } catch {
    /* fall through to the retry */
  }
  await new Promise((r) => setTimeout(r, 1_000));
  return fireOnce(api, p);
}

/**
 * `requireRoles` throws with a fixed message shape (lib/auth/context.ts:125).
 * Matching on it lets us tell a ROLE-GUARD 403 apart from a 403 thrown later by
 * a data-level ownership check — e.g. manager-service.ts:456 refusing a MANAGER
 * access to a learner who is not on their team. Both are 403s; only the first
 * one is what this matrix is measuring, and conflating them reports correct
 * defence-in-depth as a broken guard.
 */
const ROLE_GUARD_403 = /Access denied\. Required:/i;

test.describe("Phase 03 — RBAC matrix", () => {
  // One test per endpoint, covering all 7 roles inside it. The alternative
  // (one test per endpoint×role = 448 tests) spends more time on process
  // overhead than on the assertions.
  for (const probe of PROBES) {
    test(`role matrix — ${probe.label}`, async () => {
      // 7 round-trips against dev-mode routes; the default 45s is not enough
      // when a route compiles on first hit (CONVENTIONS rule 3).
      test.setTimeout(150_000);

      const contexts = await Promise.all(ALL_ROLES.map((r) => apiAs(r)));
      const escalations: string[] = [];
      const wrongRejections: string[] = [];
      const falseDenials: string[] = [];

      try {
        for (let i = 0; i < ALL_ROLES.length; i++) {
          const roleKey = ALL_ROLES[i];
          const lmsRole = LMS_ROLE[roleKey];
          const res = await fire(contexts[i], probe);
          const status = res.status();
          const isAllowed = probe.allowed.includes(lmsRole);

          if (isAllowed) {
            if (status === 403) {
              const body = (await safeJson(res)) as { message?: string };
              const msg = body?.message ?? "";
              if (ROLE_GUARD_403.test(msg)) {
                // The role guard itself refused a role it lists as allowed.
                falseDenials.push(`${lmsRole} got a ROLE-GUARD 403 despite being listed. message=${msg}`);
              } else {
                // A downstream ownership/scoping check refused this specific
                // actor-resource pair. Correct behaviour, and the reason the
                // seeded MANAGER cannot read a learner outside their team.
                console.log(`[INFO] ${probe.label}: ${lmsRole} passed the role guard, then a data-level check denied it — "${msg}"`);
              }
            }
          } else if (status !== 403) {
            if (status === 200) {
              escalations.push(`${lmsRole} got HTTP 200 — NOT in requireRoles([${probe.allowed.join(", ")}])`);
            } else {
              wrongRejections.push(
                `${lmsRole} got HTTP ${status}, expected 403 — the handler did work before authorizing`,
              );
            }
          }
        }
      } finally {
        await Promise.all(contexts.map((c) => c.dispose()));
      }

      expect(
        escalations,
        `PRIVILEGE ESCALATION on ${probe.label}:\n  ${escalations.join("\n  ")}`,
      ).toHaveLength(0);

      expect(
        wrongRejections,
        `GUARD ORDERING on ${probe.label} — rejected, but not with 403, meaning ` +
          `authorization ran after input parsing or a DB hit:\n  ${wrongRejections.join("\n  ")}`,
      ).toHaveLength(0);

      expect(
        falseDenials,
        `BROKEN GUARD on ${probe.label} — a role the route explicitly permits was ` +
          `denied:\n  ${falseDenials.join("\n  ")}`,
      ).toHaveLength(0);
    });
  }
});
