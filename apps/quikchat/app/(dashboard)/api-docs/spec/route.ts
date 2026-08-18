import { getAppAccess } from "@quikit/auth/app-access";
import { apiDocsEnabled, OPENAPI_YAML } from "@/lib/api-docs";
import { getSessionPrincipal } from "@/lib/session";

const APP_SLUG = "quikchat";

/**
 * GET /api-docs/spec — serves docs/openapi.yaml to the viewer on the sibling
 * page.
 *
 * Auth is checked HERE, explicitly, and not inherited: route handlers do not
 * run the `(dashboard)` layout, so the `requireAppAccess` gate that protects
 * `/api-docs` itself does nothing for this URL. The middleware matcher does
 * cover `/api-docs/*` (it only excludes `/api/*`), but that proves a session
 * JWT exists — not that this request has one by the time the handler runs. The
 * checks below are the actual gate.
 *
 * The gate is TWO tiers, matching the page exactly. Session alone is not
 * enough: any authenticated user anywhere on the platform holds one, including
 * users with no QuikChat grant at all, and this document describes unvalidated
 * request bodies and undocumented-500 paths — a reconnaissance document, not a
 * marketing page. `getAppAccess` is the non-redirecting half of the same
 * primitive the layout uses; `requireAppAccess` calls `redirect()` and must
 * never be used in a handler.
 *
 * Deliberately NOT `public/openapi.yaml` either: files under public/ are served
 * by the static handler, which the middleware matcher skips entirely (`.*\..*`),
 * so the spec would be world-readable.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!apiDocsEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  const principal = await getSessionPrincipal();
  if (!principal) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Argument set mirrors (dashboard)/layout.tsx exactly — same question, same
  // shape. `homeUrl` is omitted only because it feeds the redirect's popup
  // markers, which mean nothing to a fetch client.
  const { hasAccess } = await getAppAccess({
    userId: principal.userId,
    orgId: principal.orgId,
    appSlug: APP_SLUG,
    isSuperAdmin: principal.isSuperAdmin,
    memberRole: principal.membershipRole,
  });
  if (!hasAccess) {
    // 403, not 404. The caller is authenticated and identified, so 404 would
    // conceal nothing: the sibling page doesn't 404 for them either — it
    // redirects to /?reason=no_app_access, which confirms the feature exists.
    // Keeping 404 reserved for the kill switch also keeps the two conditions
    // distinguishable in ops triage ("disabled everywhere" vs "not entitled").
    return Response.json({ error: "QuikChat access required" }, { status: 403 });
  }

  return new Response(OPENAPI_YAML, {
    status: 200,
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      // Per-user gated content — never let a shared cache hold it.
      "Cache-Control": "private, no-store",
    },
  });
}
