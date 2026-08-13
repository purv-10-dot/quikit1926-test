import { NextResponse } from "next/server";
import { loadProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject } from "@/lib/api/permissions";
import type { Action } from "@/lib/api/permissionsRegistry";

/**
 * QuikTest project gate for routes whose project scope comes from the BODY or
 * QUERY rather than a path param (so `withProjectAccess` can't be used).
 *
 * The incoming value may be the project's cuid OR its human-readable
 * `projectKey` — readable URLs like /spaces/QUIKTR/test are the norm, so a route
 * can receive either.
 *
 * PREFER THIS over `gateProject`: it hands back the RESOLVED cuid so the caller
 * queries on that. A caller that filtered rows by the raw key matches nothing
 * and renders an empty screen, which reads as "my data is gone" rather than
 * "wrong identifier" — a genuinely misleading failure, so the resolved id has
 * to be the thing callers get hold of.
 *
 * Answers 404 — not 403 — when the project is missing OR the caller isn't a
 * member, matching `withProjectAccess`: a user outside the project must not
 * learn that it exists.
 */
export interface GateResult {
  /** Short-circuit response. When non-null, return it and stop. */
  denied: NextResponse | null;
  /** The project's real cuid. Only meaningful when `denied` is null. */
  projectId: string;
}

export async function gateProjectResolved(
  orgId: string,
  userId: string,
  idOrKey: string,
  resource: string,
  action: Action,
): Promise<GateResult> {
  const access = await loadProjectAccess(orgId, userId, idOrKey);
  if (!access) {
    return {
      denied: NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      ),
      projectId: "",
    };
  }

  // Everything downstream uses the resolved cuid, so nothing else has to know
  // that keys exist.
  const projectId = access.projectId;

  if (
    !access.isTenantAdmin &&
    !(await userCanInProject(userId, orgId, projectId, resource, action))
  ) {
    return {
      denied: NextResponse.json(
        { success: false, error: "You don't have access to this." },
        { status: 403 },
      ),
      projectId,
    };
  }

  return { denied: null, projectId };
}

/**
 * Verdict-only wrapper, for callers that already hold a resolved cuid (e.g. one
 * read off a record rather than a URL). If the value could be a key, use
 * `gateProjectResolved` so you get the id back.
 */
export async function gateProject(
  orgId: string,
  userId: string,
  projectId: string,
  resource: string,
  action: Action,
): Promise<NextResponse | null> {
  const { denied } = await gateProjectResolved(
    orgId,
    userId,
    projectId,
    resource,
    action,
  );
  return denied;
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
