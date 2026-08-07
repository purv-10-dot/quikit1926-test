import { NextResponse } from "next/server";
import { loadProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject } from "@/lib/api/permissions";
import type { Action } from "@/lib/api/permissionsRegistry";

/**
 * QuikTest project gate for routes whose project scope comes from the BODY or
 * QUERY rather than a path param (so `withProjectAccess` can't be used).
 *
 * Returns an error NextResponse when access is denied, or null when allowed.
 *
 * Returns 404 — not 403 — for a non-member, matching `withProjectAccess`: a
 * user outside the project must not learn that it exists.
 */
export async function gateProject(
  orgId: string,
  userId: string,
  projectId: string,
  resource: string,
  action: Action,
): Promise<NextResponse | null> {
  const access = await loadProjectAccess(orgId, userId, projectId);
  if (!access) {
    return NextResponse.json(
      { success: false, error: "Project not found" },
      { status: 404 },
    );
  }
  if (
    !access.isTenantAdmin &&
    !(await userCanInProject(userId, orgId, projectId, resource, action))
  ) {
    return NextResponse.json(
      { success: false, error: "You don't have access to this." },
      { status: 403 },
    );
  }
  return null;
}

/** Standard 500 envelope. Keeps `catch (error: unknown)` handling uniform. */
export function serverError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Operation failed";
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

/** Standard 400 for a failed Zod parse. */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}
