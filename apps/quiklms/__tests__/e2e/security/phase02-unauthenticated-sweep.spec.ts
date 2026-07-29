/**
 * PHASE 02 — Unauthenticated sweep of the entire API surface.
 *
 * Why this phase exists: `middleware.ts` skips `/api/*` entirely, so there is
 * NO systemic auth gate on this app. Every one of the 348 route files is
 * responsible for calling `requireAuth` itself. A single route that forgets is
 * a full unauthenticated data leak, and nothing but this sweep would catch it —
 * a hand-written per-route test would only cover routes someone remembered.
 *
 * The route list is derived by walking `app/api/**\/route.ts` at test-DEFINITION
 * time rather than being hard-coded, so a route added tomorrow is swept
 * automatically instead of silently escaping the audit.
 *
 * Verdicts:
 *   401/403        — guard fired. Correct.
 *   404            — guard fired, or the seeded id genuinely doesn't exist. Fine.
 *   405            — the route doesn't export GET. Proves nothing, but is safe.
 *   200            — MISSING GUARD. The route served an anonymous caller.
 *   500            — unhandled error on the unauthenticated path. A separate
 *                    finding: it means the handler ran real logic (and crashed)
 *                    BEFORE deciding the caller had no business being there.
 *
 * 200 and 500 are reported separately because they are different bugs with
 * different fixes: 200 is a missing `requireAuth`, 500 is auth-after-work.
 */

import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { apiAnon } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const API_DIR = path.join(__dirname, "..", "..", "..", "app", "api");

/**
 * Routes that are public BY DESIGN. Each is excluded with a reason, because an
 * unexplained allowlist entry is how a real hole gets grandfathered in. These
 * are the only 8 files under app/api that never call `requireAuth` — verified
 * by grep, not by assumption. Phase 04 probes each of them in depth instead.
 */
const PUBLIC_ALLOWLIST: Record<string, string> = {
  // Service descriptor / API index. Static strings only.
  "/api": "API index — returns a static service banner, no data access.",
  // Liveness probe consumed by the Playwright webServer config and by infra.
  "/api/health": "Liveness probe — must answer before any session exists.",
  // Browser error beacon: by definition fires when the client is broken, which
  // includes 'the session is gone', so it cannot require a session.
  "/api/logs/client-error": "Client-side error beacon — must accept reports from unauthenticated browsers.",
  // NextAuth's own handler. It IS the authentication endpoint.
  "/api/auth/[...nextauth]": "NextAuth handler — this is the login endpoint itself.",
  // Server-to-server callback from Zoom; authenticated by signature, not session.
  "/api/meetings/webhook/zoom": "Zoom webhook — authenticated by HMAC signature, not by a user session.",
  // Drives login-page theming, which renders before the user authenticates.
  "/api/tenants/branding/public": "Tenant branding — needed to theme the login page pre-auth.",
  // Public certificate verification: the whole point is that a third-party
  // employer with only a certificate id can check it without an account.
  "/api/verify-certificate/[certificateId]": "Public certificate verification — third parties have no account.",
  "/api/verify-certificate/[certificateId]/download": "Public certificate download — same rationale as its parent.",
};

/** A syntactically valid id that matches nothing, for segments with no seeded fixture. */
const NO_SUCH_ID = "00000000-0000-4000-8000-000000000000";

/** Walk app/api and return every route.ts as an /api/... path with [segments] intact. */
function collectRoutePaths(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectRoutePaths(full, acc);
    else if (entry.name === "route.ts") {
      const rel = path.relative(API_DIR, full).replace(/\\/g, "/").replace(/route\.ts$/, "");
      acc.push(("/api/" + rel).replace(/\/+$/, "") || "/api");
    }
  }
  return acc;
}

/**
 * Substitute seeded ids for dynamic segments. Using REAL ids matters: a route
 * that 404s on a bogus id would mask a missing auth guard, because the 404 is
 * indistinguishable from a rejection. With a live id, an unguarded route has
 * something to actually return — and returns 200.
 */
function toUrl(routePath: string): string {
  return routePath
    .replace(/\[courseId\]/g, m.courses.published)
    .replace(/\[moduleId\]/g, m.modules[0].id)
    .replace(/\[lessonId\]/g, m.modules[0].lessons[0])
    .replace(/\[assessmentId\]/g, m.assessmentId)
    .replace(/\[batchId\]/g, m.batchId ?? NO_SUCH_ID)
    .replace(/\[tenantId\]/g, m.orgId)
    // Every people-shaped segment points at the seeded learner, a row that
    // certainly exists in the primary org.
    .replace(/\[(studentId|userId|teacherId|managerId|memberId)\]/g, m.users.learner.lmsUserId)
    .replace(/\[type\]/g, "students")
    // [id] is ambiguous across ~90 routes (course? batch? exam?). A fixed
    // non-existent UUID is the honest choice: it still reaches the handler, and
    // an unguarded handler still reveals itself via a 200 envelope.
    .replace(/\[[^\]]+\]/g, NO_SUCH_ID);
}

const ALL_ROUTES = collectRoutePaths(API_DIR).sort();
const GUARDED = ALL_ROUTES.filter((p) => !(p in PUBLIC_ALLOWLIST));

const ACCEPTABLE = [401, 403, 404, 405];
const CHUNK = 25;

test.describe("Phase 02 — unauthenticated sweep", () => {
  test("route inventory is complete and the allowlist still matches reality", () => {
    // If this drifts, the sweep below is silently testing the wrong surface.
    expect(ALL_ROUTES.length, "expected 348 route.ts files under app/api").toBe(348);
    for (const p of Object.keys(PUBLIC_ALLOWLIST)) {
      expect(ALL_ROUTES, `allowlisted route no longer exists: ${p}`).toContain(p);
    }
    expect(GUARDED.length).toBe(ALL_ROUTES.length - Object.keys(PUBLIC_ALLOWLIST).length);
  });

  for (let start = 0; start < GUARDED.length; start += CHUNK) {
    const slice = GUARDED.slice(start, start + CHUNK);
    const label = `routes ${start + 1}–${start + slice.length}`;

    test(`no unauthenticated access — ${label}`, async () => {
      // 45s is the suite default, but a chunk is 25 round-trips against
      // dev-mode routes that compile on first hit — a cold chunk measured at
      // ~170s. Raised deliberately so a slow sweep reports a RESULT rather
      // than a timeout (CONVENTIONS rule 3).
      test.setTimeout(300_000);

      const anon = await apiAnon();
      const leaks: string[] = [];
      const crashes: string[] = [];
      const catchAll: string[] = [];

      /**
       * The Next dev server resets connections when several workers pile onto
       * it, which surfaces as ECONNRESET. That is a property of the harness,
       * not of the application, so it gets one retry before we give up — an
       * audit must not report a torn socket as a security result.
       */
      const getWithRetry = async (url: string) => {
        try {
          return await anon.get(url, { maxRedirects: 0, timeout: 90_000 });
        } catch {
          await new Promise((r) => setTimeout(r, 1_000));
          return anon.get(url, { maxRedirects: 0, timeout: 90_000 });
        }
      };

      // Bounded concurrency: enough to fit the budget, low enough not to
      // saturate the single dev server the other workers are also using.
      let cursor = 0;
      const worker = async () => {
        while (cursor < slice.length) {
          const routePath = slice[cursor++];
          const url = toUrl(routePath);
          // The 90s per-request timeout inside getWithRetry overrides the
          // suite's 15s `actionTimeout`: four workers each sweeping a chunk put
          // ~12 concurrent requests on a single dev server that compiles routes
          // on first hit, and 15s is not enough for a cold one.
          const res = await getWithRetry(url);
          const status = res.status();
          if (ACCEPTABLE.includes(status)) continue;

          if (status === 200) {
            // Distinguish a real unguarded JSON route from the `(shared)/[...slug]`
            // catch-all page, which renders a 200 HTML placeholder for ANY
            // unmatched URL (CONVENTIONS rule 1). If we see HTML here it means
            // this spec derived a URL that doesn't resolve to the route file —
            // a TEST bug, not a product one, and it must not be reported as a leak.
            const ct = res.headers()["content-type"] ?? "";
            if (ct.includes("text/html")) catchAll.push(`${routePath} -> ${url}`);
            else leaks.push(`${routePath} -> ${url}`);
          } else if (status >= 500) {
            crashes.push(`${routePath} -> ${url} (HTTP ${status})`);
          } else {
            leaks.push(`${routePath} -> ${url} (unexpected HTTP ${status})`);
          }
        }
      };
      await Promise.all(Array.from({ length: 3 }, worker));
      await anon.dispose();

      expect(
        catchAll,
        `TEST BUG (not a finding): these URLs fell through to the [...slug] catch-all page, ` +
          `meaning toUrl() produced a path with no matching route:\n  ${catchAll.join("\n  ")}`,
      ).toHaveLength(0);

      expect(
        crashes,
        `UNHANDLED ERROR on the unauthenticated path — the handler executed real ` +
          `logic before rejecting the anonymous caller:\n  ${crashes.join("\n  ")}`,
      ).toHaveLength(0);

      expect(
        leaks,
        `MISSING AUTH GUARD — served an anonymous caller (expected 401/403/404/405):\n  ${leaks.join("\n  ")}`,
      ).toHaveLength(0);
    });
  }
});
