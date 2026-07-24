/**
 * PHASE 20 — Page-level role gating.
 *
 * The auth map claims every route-group layout renders chrome and enforces
 * nothing: `(super-admin)/layout.tsx` is `<AppShell role="SUPER_ADMIN">` with
 * no session read, no requireRoles, no redirect. If true, a LEARNER can load
 * the super-admin dashboard and only the XHRs it fires will 403.
 *
 * This phase verifies that claim through a real browser rather than trusting
 * the source read. Two things are being separated:
 *   1. Does the page RENDER for the wrong role? (the gating question)
 *   2. Does it LEAK data to the wrong role? (the severity question)
 * A page that renders an empty shell because every XHR 403'd is a UX/defence-
 * in-depth problem. A page that renders another role's actual data is a real
 * vulnerability. The tests below distinguish the two deliberately.
 *
 * NOTE: `app/(shared)/[...slug]/page.tsx` is a catch-all that 200s for ANY
 * unmatched URL, so "the page loaded" proves nothing — every assertion here
 * keys on content unique to the target page.
 */

import { test, expect, type Page } from "@playwright/test";
import { storageStateFor, type RoleKey } from "../fixtures/auth";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3020";

/** Pages that should belong to exactly one role, with a marker string that
 *  only appears when the real page (not the catch-all placeholder) renders. */
const PRIVILEGED_PAGES: Array<{ path: string; owner: RoleKey; marker: RegExp }> = [
  { path: "/dashboard",           owner: "superAdmin",  marker: /super admin dashboard|platform health/i },
  { path: "/tenants",             owner: "superAdmin",  marker: /organization|tenant/i },
  { path: "/platform-analytics",  owner: "superAdmin",  marker: /platform analytics|cross-tenant/i },
  { path: "/system-health",       owner: "superAdmin",  marker: /infrastructure pulse|system health/i },
  { path: "/master-courses",      owner: "superAdmin",  marker: /master library|master course/i },
  { path: "/payouts",             owner: "tenantAdmin", marker: /teacher payouts|payout/i },
  { path: "/user-management",     owner: "tenantAdmin", marker: /user|learner/i },
  { path: "/manager-dashboard",   owner: "manager",     marker: /team dashboard|compliance rate/i },
];

/** The placeholder the catch-all renders — if we see this, the real page did
 *  NOT render and the URL simply isn't a built route for this build. */
const SCAFFOLD_MARKER = /wired to its API and ready for UI build-out/i;

async function loadAs(page: Page, role: RoleKey, path: string) {
  const state = await storageStateFor(role, BASE);
  await page.context().addCookies(state.cookies);
  const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
  // Let client components fire their XHRs and settle.
  await page.waitForTimeout(1500);
  return resp;
}

test.describe("Phase 20 — route-group layouts do not enforce roles", () => {
  for (const { path, owner, marker } of PRIVILEGED_PAGES) {
    test(`LEARNER loading ${path} (owned by ${owner})`, async ({ page }) => {
      const resp = await loadAs(page, "learner", path);
      const status = resp?.status() ?? 0;
      const body = await page.content();

      const isScaffold = SCAFFOLD_MARKER.test(body);
      const renderedReal = marker.test(body) && !isScaffold;
      const redirected = !page.url().includes(path);

      // Record the observed behaviour explicitly — this phase documents a
      // design gap, so the console line is part of the deliverable.
      console.log(
        `[GATING] ${path} as LEARNER → http ${status}, redirected=${redirected}, ` +
          `realPage=${renderedReal}, scaffold=${isScaffold}, url=${page.url()}`,
      );

      // The security-relevant assertion: whatever renders, it must not contain
      // another tenant's or role's actual records. We check for the clearest
      // signal of leaked privileged data — the victim tenant's name.
      expect(
        body,
        `DATA LEAK: privileged page ${path} rendered foreign-tenant data to a LEARNER`,
      ).not.toContain("QuikLMS E2E Other");

      // Documented expectation: a privileged page SHOULD redirect or refuse.
      // This is expected to fail today; the failure IS the finding.
      expect(
        redirected || !renderedReal,
        `NO PAGE-LEVEL GATING: a LEARNER fully rendered ${path}, which belongs to ${owner}. ` +
          `Route-group layouts render chrome only (app/${owner === "superAdmin" ? "(super-admin)" : "(…)"}/layout.tsx) ` +
          `and perform no session/role check; middleware.ts enforces authentication only.`,
      ).toBeTruthy();
    });
  }
});

test.describe("Phase 20 — client-trusted role signal", () => {
  test("[informational] AdaptiveShell picks navigation from client-writable localStorage", async ({ page }) => {
    // components/AdaptiveShell.tsx reads `localStorage.qs_role` to choose which
    // sidebar to render. That value is fully attacker-controlled in their own
    // browser. It is a UI-only signal — the API still enforces roles server-side
    // — so this is presentation spoofing, not privilege escalation. Recorded so
    // the distinction is on the record rather than assumed.
    const state = await storageStateFor("learner", BASE);
    await page.context().addCookies(state.cookies);
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.setItem("qs_role", "SUPER_ADMIN"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    const body = await page.content();
    console.log(
      `[INFO] After forcing localStorage.qs_role=SUPER_ADMIN as a LEARNER, ` +
        `super-admin nav present=${/master library|platform analytics|system health/i.test(body)}`,
    );

    // Server-side authority is what actually matters — assert the API still refuses.
    const res = await page.request.get(`${BASE}/api/tenants`);
    expect(
      res.status(),
      "SERVER-SIDE ESCALATION: forcing a client role signal changed API authorization",
    ).toBe(403);
  });
});
