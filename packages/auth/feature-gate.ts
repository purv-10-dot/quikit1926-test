/**
 * FF-1 feature gate helpers — L3 enforcement for per-tenant module flags.
 *
 * Three shapes of gate:
 *   1. `getDisabledModules(tenantId, appSlug)` — raw query, request-deduped
 *      via React.cache. Use when you need the set for rendering (sidebar).
 *   2. `gateModuleRoute(appSlug, moduleKey, authOptions)` — call inside a
 *      server-component layout.tsx. Redirects to /dashboard if disabled.
 *   3. `gateModuleApi(appSlug, moduleKey, tenantId)` — call at the top of a
 *      route handler. Returns a `Response` (404) if disabled, or null.
 *
 * The cascade rule ("parent disabled ⇒ children disabled") is applied by
 * `@quikit/shared/moduleRegistry`'s `isModuleEnabled`; this module just
 * plumbs the data and response paths.
 *
 * See docs/plans/FF-1-app-feature-flags.md.
 */

import * as React from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { db } from "@quikit/database";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";

/**
 * React.cache() is only available in React 18 Canary / React 19 (which Next.js
 * bundles in server components). When running under Vitest (plain React 18.2),
 * it's undefined — fall back to an identity wrapper so the module imports cleanly.
 * The per-request dedup benefit is lost in tests, but correctness is preserved.
 */
const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (React as any).cache ?? ((fn) => fn);

/**
 * Returns the set of moduleKeys that are EXPLICITLY disabled for the given
 * (tenantId, appSlug) pair. Absence of a key means the module is enabled
 * (sparse storage — the default).
 *
 * Deduped per-request via React.cache — sidebar + layout gates + page
 * components all share the same result within a single render pass.
 */
export const getDisabledModules = cache(
  async (tenantId: string, appSlug: string): Promise<Set<string>> => {
    try {
      const app = await db.app.findUnique({
        where: { slug: appSlug },
        select: { id: true },
      });
      if (!app) return new Set();
      const rows = await db.appModuleFlag.findMany({
        where: { tenantId, appId: app.id, enabled: false },
        select: { moduleKey: true },
      });
      // Defensive: mocks / edge cases may return undefined. Treat as "all enabled".
      if (!Array.isArray(rows)) return new Set();
      return new Set(rows.map((r) => r.moduleKey));
    } catch {
      // Fail-open: if the gate query itself errors, don't block the app —
      // log and treat as all-enabled. A broken gate shouldn't take down the
      // entire module.
      return new Set();
    }
  },
);

/**
 * Server-component gate. Call from a `layout.tsx` at the top of the module's
 * route subtree. Redirects to /dashboard with a `?feature_disabled=<key>`
 * query param when the module (or any ancestor) is disabled for the caller's
 * tenant. Also redirects to /select-org if the caller has no active tenant.
 *
 * Usage:
 *   // apps/quikscale/app/(dashboard)/kpi/layout.tsx
 *   import { gateModuleRoute } from "@quikit/auth/feature-gate";
 *   import { authOptions } from "@/lib/auth";
 *   export default async function KPILayout({ children }) {
 *     await gateModuleRoute("quikscale", "kpi", authOptions);
 *     return <>{children}</>;
 *   }
 */
export async function gateModuleRoute(
  appSlug: string,
  moduleKey: string,
  authOptions: NextAuthOptions,
): Promise<void> {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;
  if (!tenantId) {
    redirect("/select-org");
  }
  const disabled = await getDisabledModules(tenantId, appSlug);
  if (!isModuleEnabled(moduleKey, disabled)) {
    redirect(`/dashboard?feature_disabled=${encodeURIComponent(moduleKey)}`);
  }
}

/**
 * API route gate. Call after you've verified the session and resolved the
 * tenantId; returns a 404 `NextResponse` if the module is disabled, or
 * `null` to let you continue.
 *
 * Usage:
 *   // apps/quikscale/app/api/kpi/route.ts
 *   const session = await getServerSession(authOptions);
 *   if (!session?.user?.tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
 *   const blocked = await gateModuleApi("quikscale", "kpi", session.user.tenantId);
 *   if (blocked) return blocked;
 *   // ... rest of handler ...
 */
export async function gateModuleApi(
  appSlug: string,
  moduleKey: string,
  tenantId: string,
): Promise<Response | null> {
  // SA-A.6: hard gate check runs FIRST. If the tenant's app access is revoked,
  // no module-level logic matters.
  const appBlocked = await isTenantAppBlocked(tenantId, appSlug);
  if (appBlocked) {
    return NextResponse.json(
      { success: false, error: "App access blocked for this tenant" },
      { status: 403 },
    );
  }
  const disabled = await getDisabledModules(tenantId, appSlug);
  if (!isModuleEnabled(moduleKey, disabled)) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }
  return null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * SA-A.6 — Tenant-App hard gate
 *
 * Super admins can revoke an entire app for a tenant via the TenantAppAccess
 * table (e.g. "trial expired", "plan downgraded", "payment failed"). This
 * gate is evaluated BEFORE the module-level FF-1 gates, so a revoked app
 * returns a 403 / redirect even when some modules are nominally enabled.
 *
 * Sparse storage: a row exists in TenantAppAccess only when the super admin
 * has explicitly toggled access off. Absence of a row = access granted.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * True if the (tenantId, appSlug) pair has been explicitly blocked by a super
 * admin. Request-deduped via React.cache so a single render / handler pass
 * hits the DB at most once.
 */
export const isTenantAppBlocked = cache(
  async (tenantId: string, appSlug: string): Promise<boolean> => {
    try {
      const app = await db.app.findUnique({
        where: { slug: appSlug },
        select: { id: true },
      });
      if (!app) return false; // unknown app → not blocked (let upstream 404)
      const access = await db.tenantAppAccess.findUnique({
        where: { tenantId_appId: { tenantId, appId: app.id } },
        select: { enabled: true },
      });
      if (!access) return false; // no row → default enabled
      return access.enabled === false;
    } catch {
      // Fail-open: if the gate query errors, don't lock users out of the app.
      // Security posture: we trust this is a platform-wide administrative
      // gate, not a per-user authorization check — the cost of erring open
      // is "user sees app they should have been blocked from for N minutes"
      // which the super admin can fix; the cost of erring closed is
      // "entire tenant is locked out of the app on a transient DB glitch".
      return false;
    }
  },
);

/**
 * Route-level hard gate. Call from a server layout at the top of an app's
 * authenticated section. Redirects to the launcher with a reason query
 * param when the tenant's app access is revoked.
 *
 * Usage:
 *   // apps/quikscale/app/(dashboard)/layout.tsx
 *   await gateTenantAppRoute("quikscale", authOptions);
 */
export async function gateTenantAppRoute(
  appSlug: string,
  authOptions: NextAuthOptions,
): Promise<void> {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;
  if (!tenantId) {
    redirect("/select-org");
  }
  const blocked = await isTenantAppBlocked(tenantId, appSlug);
  if (blocked) {
    // Bounce back to the launcher's apps page with a flag so it can render
    // a "you no longer have access" notice.
    const launcher = process.env.QUIKIT_URL ?? "/";
    const target = `${launcher.replace(/\/+$/, "")}/apps?blocked=${encodeURIComponent(appSlug)}`;
    redirect(target);
  }
}
