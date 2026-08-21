import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeSecretEqual } from "@/lib/secret-compare";
import { resolvePermissions } from "@/lib/api/resolvePermissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/permissions — service-to-service only, no user context.
 *
 * Answers "what may this user do?" for the AI Runtime, which resolves it once
 * per turn and gates tool calls on the result.
 *
 * Auth: same pattern and same secret as /api/internal/manifest —
 * `x-internal-secret` compared constant-time against INTERNAL_AI_RUNTIME_SECRET,
 * fail-closed when the configured secret is missing or empty. DB-touching
 * internal routes without withOrgAuth have precedent in
 * /api/internal/provision-roles; there is no session to read here.
 *
 *   GET /api/internal/permissions?userId=<id>&orgId=<id>[&projectId=<id|key>]
 *
 * The requested flat `(userId, orgId) → string[]` shape is deliberately NOT
 * implemented. Project roles OVERRIDE the app-wide role rather than adding to
 * it, so a flat list over-reports: a user whose app-wide role grants
 * Issue:create but whose project role in a space does not would appear to hold
 * it. See lib/api/resolvePermissions.ts for the model and the two documented
 * divergences from `userCanInProject`.
 *
 * Contract notes for the consumer:
 *   - `isAdmin` is `hasAdminAccess` (org-tier admin OR QuikTrack app-admin) and
 *     bypasses everything. `orgPermissions` is the literal `userCan` answer,
 *     which has NO admin bypass. Both semantics are on the wire because the app
 *     itself uses both gates; pick per call site.
 *   - Reads gate on `project.isMember`, not on a `view` grant.
 *   - A grant is coarse: `Issue:update` means "may update SOME fields".
 *     QtProjectRoleFieldPermission is a finer, per-field gate this endpoint
 *     does not report.
 *   - `roleName` is available from loadMyPermissions if the runtime ever wants
 *     it for audit; deliberately not shipped in v1.
 *   - No `asOf`/TTL in v1: the runtime resolves once per turn, so a permission
 *     change taking effect on the next turn is acceptable.
 */
const QuerySchema = z.object({
  userId: z.string().trim().min(1),
  orgId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
});

export async function GET(req: NextRequest) {
  const secret = process.env.INTERNAL_AI_RUNTIME_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!safeSecretEqual(provided, secret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    userId: searchParams.get("userId") ?? undefined,
    orgId: searchParams.get("orgId") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "userId and orgId are required" },
      { status: 400 },
    );
  }

  try {
    const data = await resolvePermissions(
      parsed.data.userId,
      parsed.data.orgId,
      parsed.data.projectId ?? null,
    );
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    // Fixed message on purpose: the caller is a service that cannot act on a
    // Prisma error string, and this route answers questions about arbitrary
    // user ids — nothing about the query should come back in an error body.
    void error;
    return NextResponse.json(
      { success: false, error: "Failed to resolve permissions" },
      { status: 500 },
    );
  }
}
