import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/internal/apps/[slug]
 *
 * Service-to-service read of the App Registry, so internal services (AI
 * Runtime, Search, Comms) can resolve `slug` -> `baseUrl` instead of hardcoding
 * each app's URL per environment. The registry is the source of truth; the
 * super-admin UI at /app-registry is the human view of the same rows.
 *
 * This is the machine-readable sibling of `/api/super/apps`, which is gated on
 * a super-admin *session* and therefore unreachable for a service caller.
 *
 * Authorization: `x-internal-secret` must equal INTERNAL_SECRET — the same
 * shared secret that gates the auth service's /api/verify-token and
 * /api/auth/internal/issue-agent-jwt. Mirrors those routes so callers need no
 * new credential.
 *
 * Ops surfaces are NOT routable: any app flagged `requiresOrgAdmin` (Admin
 * Portal and any future ops/billing surface) is treated as non-existent here.
 * It returns 404 rather than 403 deliberately — a 403 would confirm the slug
 * exists and disclose which apps are ops surfaces.
 *
 * `status` is returned rather than filtered on: the caller decides whether a
 * non-"active" app is a valid target for its own use case.
 *
 * Secrets are never included. `hasOAuthClient` is a boolean presence flag; the
 * clientId/clientSecret stay in /api/super/apps/[id]/oauth behind super-admin
 * auth.
 */

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const expected = process.env.INTERNAL_SECRET;
    if (!expected) {
      // Fail closed. Without this an unset env var would leave the comparison
      // below deciding access on `undefined`.
      return NextResponse.json(
        { success: false, error: "Server misconfigured (INTERNAL_SECRET missing)" },
        { status: 500 },
      );
    }
    if (req.headers.get("x-internal-secret") !== expected) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 401 });
    }

    const slug = params.slug?.trim();
    if (!slug) {
      return NextResponse.json({ success: false, error: "slug is required" }, { status: 422 });
    }

    const app = await db.app.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        iconUrl: true,
        baseUrl: true,
        status: true,
        requiresOrgAdmin: true,
        oauthClient: { select: { clientId: true } },
      },
    });

    // Unknown slug and ops-surface slug are deliberately indistinguishable.
    if (!app || app.requiresOrgAdmin) {
      return NextResponse.json(
        { success: false, error: `No routable app with slug '${slug}'` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: app.id,
        slug: app.slug,
        name: app.name,
        description: app.description,
        iconUrl: app.iconUrl,
        baseUrl: app.baseUrl,
        status: app.status,
        hasOAuthClient: !!app.oauthClient,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
