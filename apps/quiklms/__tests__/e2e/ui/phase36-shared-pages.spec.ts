/**
 * PHASE 36 — the `(shared)` pages, the three root-level pages, and the `/`
 * role-landing redirect for all seven roles.
 *
 * Three things here are deliberately more than "does it render":
 *
 *  1. `/` must send each role to ITS OWN dashboard. `app/page.tsx` holds a
 *     seven-entry LANDING map resolved through `resolveLmsRole`; the whole map
 *     is verified, not sampled.
 *  2. `/login` is verified for an ALREADY-AUTHENTICATED user, which is the case
 *     that actually happens in this app (session expiry, "Switch account", the
 *     API 401 handler and the learner session-expiry paths all funnel here).
 *     The app's own
 *     role-aware landing lives at `/`, but middleware never asks it.
 *  3. `/verify-certificate/[id]` is verified by where its XHR goes, not by what
 *     it prints — it prints "Certificate Not Found" either way, which is exactly
 *     what makes a content-only assertion useless on this page.
 *
 * The `(shared)` group is also the one place where the navigation shell picks a
 * role from `localStorage` instead of the session, so the shell's role label is
 * asserted against the session role rather than assumed.
 */

import { test, expect } from "@playwright/test";
import { watch, gotoAs, expectRealPage, expectNoServerErrors, bodyText, BASE } from "../fixtures/page";
import { loadManifest, storageStateFor, type RoleKey } from "../fixtures/auth";

const m = loadManifest() as ReturnType<typeof loadManifest> & { meetingId: string; conversationId: string };

test.describe("Phase 36 — (shared) pages", () => {
  const SHARED: Array<{ path: string; role: RoleKey; h1: string; copy: RegExp }> = [
    { path: "/profile",        role: "learner", h1: "Profile Settings", copy: /Manage your account settings and preferences/i },
    { path: "/messages",       role: "learner", h1: "Messages",         copy: /Connect and communicate with your team/i },
    // No longer a form: passwords are owned by the central auth service, so the
    // page explains that and links out. See app/(shared)/reset-password/page.tsx.
    { path: "/reset-password", role: "learner", h1: "Reset Password",   copy: /managed by your QuikIT account/i },
    { path: `/video/${m.meetingId}`, role: "teacher", h1: "E2E Meeting", copy: /Video class session/i },
  ];

  for (const { path, role, h1, copy } of SHARED) {
    test(`${role} renders ${path}`, async ({ page }) => {
      test.setTimeout(150_000);

      const probe = watch(page);
      const status = await gotoAs(page, role, path, { settle: 1_500 });

      expect(status, `${path}: navigation did not return 200`).toBe(200);
      await expectRealPage(page, { path, heading: { name: h1, level: 1 }, text: copy });
      expectNoServerErrors(probe, path);

      if (probe.apiFailures.length) console.log(`[XHR ${path}] ${JSON.stringify(probe.apiFailures)}`);
    });
  }

  test("/messages loads the seeded conversation", async ({ page }) => {
    test.setTimeout(150_000);
    const probe = watch(page);
    await gotoAs(page, "learner", "/messages", { settle: 2_500 });

    await expect(
      page.getByText("Hello from the E2E seed.", { exact: false }).first(),
      "/messages rendered its shell but not the seeded conversation preview",
    ).toBeVisible({ timeout: 20_000 });

    expectNoServerErrors(probe, "/messages");
  });

  test("the shared shell reflects the session role, not a client default", async ({ page }) => {
    /**
     * `app/(shared)/layout.tsx` renders `<AdaptiveShell>`, which resolves the
     * navigation role from `localStorage.qs_role` and falls back to 'LEARNER'
     * when it is absent (components/AdaptiveShell.tsx:11-13). It never reads the
     * session. On a fresh browser — which is every first visit — six of the
     * seven roles therefore get the LEARNER sidebar on /profile, /messages,
     * /reset-password and /video/[id].
     */
    test.setTimeout(150_000);
    await gotoAs(page, "tenantAdmin", "/profile", { settle: 1_500 });
    const text = await bodyText(page);
    console.log(`[SHELL] /profile as TENANT_ADMIN → header=${JSON.stringify(text.slice(0, 180))}`);

    expect(
      /Admin\s*·/.test(text),
      "/profile as TENANT_ADMIN rendered the LEARNER navigation shell — AdaptiveShell " +
        "defaults localStorage.qs_role to 'LEARNER' and never consults the session",
    ).toBe(true);
  });
});

test.describe("Phase 36 — root-level pages", () => {
  test("/design renders the design system reference", async ({ page }) => {
    test.setTimeout(150_000);
    const probe = watch(page);
    const status = await gotoAs(page, "learner", "/design");

    expect(status).toBe(200);
    await expectRealPage(page, {
      path: "/design",
      heading: { name: "Design System", level: 1 },
      text: /Token-driven foundation/i,
    });
    expectNoServerErrors(probe, "/design");
  });

  test("/login is publicly reachable and server-renders the SSO bounce", async ({ page }) => {
    // Asserted over the raw response rather than a browser render: an
    // unauthenticated client-side `signIn('quikit')` navigates straight off to
    // the external IdP, which this suite deliberately does not depend on.
    const res = await page.request.get(`${BASE}/login`);
    expect(res.status(), "/login must be reachable without a session").toBe(200);
    const html = await res.text();
    expect(html, "/login did not server-render its sign-in bounce").toContain("Redirecting to sign-in");
    expect(html, "/login rendered the (shared) catch-all scaffold").not.toMatch(
      /wired to its API and ready for UI build-out/i,
    );
  });

  test("/verify-certificate/[id] calls the verification API", async ({ page }) => {
    /**
     * The page fetches `${NEXT_PUBLIC_API_URL}/verify-certificate/${id}`
     * (app/verify-certificate/[certificateId]/page.tsx:24-26). NEXT_PUBLIC_API_URL
     * is the app origin, so that resolves to the PAGE's own URL, not the API —
     * the response is HTML, `.json()` throws, and the catch renders
     * "Certificate Not Found" for every id including valid ones.
     *
     * Asserted on the request target because the rendered output is identical
     * whether the certificate exists or not.
     */
    test.setTimeout(150_000);
    const seen: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("verify-certificate")) seen.push(r.url().replace(BASE, ""));
    });

    await gotoAs(page, "learner", "/verify-certificate/e2e-nonexistent-cert", { settle: 2_000 });
    console.log(`[VERIFY-CERT] requests=${JSON.stringify(seen)}`);

    expect(
      seen.some((u) => u.startsWith("/api/verify-certificate/")),
      "the certificate verification page never called /api/verify-certificate/[id]; " +
        `it requested ${JSON.stringify(seen)} instead — NEXT_PUBLIC_API_URL is the app ` +
        "origin, so the fetch targets the page route and always fails to parse as JSON",
    ).toBe(true);
  });
});

test.describe("Phase 36 — / role landing", () => {
  const LANDING: Record<RoleKey, string> = {
    superAdmin:  "/dashboard",
    tenantAdmin: "/tenant-dashboard",
    subAdmin:    "/sub-admin-dashboard",
    manager:     "/manager-dashboard",
    teacher:     "/teacher-dashboard",
    parent:      "/parent-dashboard",
    learner:     "/learner/dashboard",
  };

  for (const [role, expected] of Object.entries(LANDING) as Array<[RoleKey, string]>) {
    test(`/ sends ${role} to ${expected}`, async ({ page }) => {
      test.setTimeout(150_000);
      await gotoAs(page, role, "/", { settle: 1_000 });
      const landed = new URL(page.url()).pathname;

      expect(
        landed,
        `/ resolved ${role} to ${landed} instead of ${expected} — app/page.tsx maps the ` +
          `role via resolveLmsRole and must land each role on its own dashboard`,
      ).toBe(expected);
    });
  }
});

test.describe("Phase 36 — /login for an already-authenticated user", () => {
  /**
   * The app's role-aware landing is `app/page.tsx`. `apps/quiklms/middleware.ts`
   * builds `createMiddleware({ loginRoute: '/login', ... })` without a
   * `postLoginRoute`, and packages/auth/middleware.ts:226 then falls back to a
   * hard-coded `"/dashboard"` for any authenticated request to the login route.
   * Every role — not just ADMIN — is therefore bounced to the super-admin
   * dashboard, whose XHRs 403 for everyone else.
   */
  const LANDING: Record<RoleKey, string> = {
    superAdmin:  "/dashboard",
    tenantAdmin: "/tenant-dashboard",
    subAdmin:    "/sub-admin-dashboard",
    manager:     "/manager-dashboard",
    teacher:     "/teacher-dashboard",
    parent:      "/parent-dashboard",
    learner:     "/learner/dashboard",
  };

  for (const role of ["learner", "teacher", "tenantAdmin", "parent"] as RoleKey[]) {
    test(`/login sends an authenticated ${role} to their own dashboard`, async ({ page }) => {
      test.setTimeout(150_000);
      const state = await storageStateFor(role, BASE);
      await page.context().addCookies(state.cookies);

      const res = await page.request.get(`${BASE}/login`, { maxRedirects: 0 });
      const location = res.headers()["location"] ?? "(none)";
      console.log(`[LOGIN-REDIRECT] ${role} → ${res.status()} ${location}`);

      expect(
        new URL(location, BASE).pathname,
        `/login redirected an authenticated ${role} to ${location} instead of ` +
          `${LANDING[role]}; middleware falls back to a hard-coded "/dashboard" ` +
          `(packages/auth/middleware.ts:226) because apps/quiklms/middleware.ts sets ` +
          `no postLoginRoute`,
      ).toBe(LANDING[role]);
    });
  }

  // The `/role-select` shim was removed — it was a retired dev role-picker kept
  // only as a redirect to /login, and every caller now links to /login directly.
  // Its forwarding test went with it; /login is covered above.
});
