/**
 * Server-side cross-row validation for KPI create/update.
 *
 * Extracted from `app/api/kpi/route.ts` to keep the main route file focused
 * on orchestration (auth → validate → persist). The Zod schema already
 * handles field-level checks; these helpers handle DB-dependent invariants
 * that Zod can't express alone:
 *
 *   - Team exists in the tenant
 *   - Actor has permission to manage the team
 *   - All ownerIds are active members of the team
 *   - ownerContributions keys match ownerIds
 *   - Owner user exists for individual KPIs
 *   - Parent KPI belongs to the same tenant
 *
 * Each helper returns either a JSON error response (to forward to the client)
 * or `null` on success.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canManageTeamKPI } from "@/lib/api/teamKPIPermissions";

type ValidationResult = NextResponse | null;

export interface TeamKPIValidationInput {
  tenantId: string;
  actorUserId: string;
  teamId: string | null | undefined;
  ownerIds: string[] | null | undefined;
  ownerContributions: Record<string, number> | null | undefined;
}

/**
 * Validates a team KPI create/update payload.
 * Returns a NextResponse error on failure, or null on success.
 */
export async function validateTeamKPICreate(
  input: TeamKPIValidationInput
): Promise<ValidationResult> {
  const { tenantId, actorUserId, teamId, ownerIds: rawOwnerIds, ownerContributions } = input;

  if (!teamId) {
    return NextResponse.json(
      { success: false, error: "teamId is required for team KPIs" },
      { status: 400 }
    );
  }

  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team || team.tenantId !== tenantId) {
    return NextResponse.json(
      { success: false, error: "Team not found" },
      { status: 404 }
    );
  }

  const allowed = await canManageTeamKPI(actorUserId, tenantId, teamId);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "You must be a team head or admin to create KPIs for this team." },
      { status: 403 }
    );
  }

  const ownerIds = rawOwnerIds ?? [];
  if (ownerIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "At least one KPI owner is required for team KPIs" },
      { status: 400 }
    );
  }

  // All ownerIds must be active members of this team
  const memberships = await db.membership.findMany({
    where: { tenantId, teamId, userId: { in: ownerIds }, status: "active" },
    select: { userId: true },
  });
  const validIds = new Set(memberships.map((m) => m.userId));
  const invalid = ownerIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return NextResponse.json(
      { success: false, error: `Some selected owners are not active members of this team: ${invalid.length} user(s)` },
      { status: 400 }
    );
  }

  // ownerContributions must cover exactly ownerIds and sum to ~100
  const contributions = (ownerContributions ?? {}) as Record<string, number>;
  const contribKeys = Object.keys(contributions);
  if (contribKeys.length !== ownerIds.length || ownerIds.some((id) => !(id in contributions))) {
    return NextResponse.json(
      { success: false, error: "Owner contributions must be provided for every owner" },
      { status: 400 }
    );
  }
  const sum = Object.values(contributions).reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 100) > 0.5) {
    return NextResponse.json(
      { success: false, error: `Owner contributions must sum to 100% (got ${sum.toFixed(1)}%)` },
      { status: 400 }
    );
  }

  return null;
}

export interface IndividualKPIValidationInput {
  tenantId: string;
  owner: string | null | undefined;
  teamId: string | null | undefined;
}

/**
 * Validates an individual KPI create/update payload.
 */
export async function validateIndividualKPICreate(
  input: IndividualKPIValidationInput
): Promise<ValidationResult> {
  const { tenantId, owner, teamId } = input;

  if (!owner) {
    return NextResponse.json(
      { success: false, error: "Owner is required for individual KPIs" },
      { status: 400 }
    );
  }

  const ownerUser = await db.user.findUnique({ where: { id: owner } });
  if (!ownerUser) {
    return NextResponse.json(
      { success: false, error: "Owner user not found" },
      { status: 404 }
    );
  }

  if (teamId) {
    const team = await db.team.findUnique({ where: { id: teamId } });
    if (!team || team.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Team not found" },
        { status: 404 }
      );
    }
  }

  return null;
}

/**
 * Validates that a parent KPI exists and belongs to the same tenant.
 */
export async function validateParentKPI(
  parentKPIId: string | null | undefined,
  tenantId: string
): Promise<ValidationResult> {
  if (!parentKPIId) return null;

  const parentKPI = await db.kPI.findUnique({ where: { id: parentKPIId } });
  if (!parentKPI || parentKPI.tenantId !== tenantId) {
    return NextResponse.json(
      { success: false, error: "Parent KPI not found" },
      { status: 404 }
    );
  }
  return null;
}
