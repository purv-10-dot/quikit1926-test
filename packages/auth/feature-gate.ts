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

import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { db } from "@quikit/database";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";

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
    const app = await db.app.findUnique({
      where: { slug: appSlug },
      select: { id: true },
    });
    if (!app) return new Set();
    const rows = await db.appModuleFlag.findMany({
      where: { tenantId, appId: app.id, enabled: false },
      select: { moduleKey: true },
    });
    return new Set(rows.map((r) => r.moduleKey));
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
  const disabled = await getDisabledModules(tenantId, appSlug);
  if (!isModuleEnabled(moduleKey, disabled)) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }
  return null;
}
