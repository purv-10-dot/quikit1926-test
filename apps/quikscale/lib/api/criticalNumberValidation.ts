/**
 * Cross-row validation for Critical Numbers — the checks that need the DB and
 * therefore can't live in the Zod schema.
 *
 * Mirrors `kpiCreateValidation.ts`: each function returns a ready-made
 * `NextResponse` on failure, or `null` when the input is fine, so route
 * handlers stay a flat sequence of early returns.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MAX_CRITICAL_NUMBERS_PER_TEAM } from "@/lib/schemas/criticalNumberSchema";

export type ValidationResult = NextResponse | null;

/**
 * The team exists and belongs to this org.
 *
 * `QsTeam` is the app_quikscale team (physically `app_quikscale."Team"`), the
 * same one KPI and Priority point at.
 */
export async function validateTeamInOrg(
  orgId: string,
  teamId: string,
): Promise<ValidationResult> {
  const team = await db.qsTeam.findFirst({
    where: { id: teamId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!team) {
    return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
  }
  return null;
}

/**
 * Every user eligible to OWN a Critical Number on this team: the `QsUserTeam`
 * join rows UNION the team's head.
 *
 * Exported because `GET /api/critical-numbers/team-members` serves the Owner
 * dropdown from this exact function — so the picker offers precisely what
 * `validateOwnerInTeam` below accepts. Same "can't offer what POST rejects"
 * rule the options route documents; here it's guaranteed by sharing the query
 * rather than by two lists being kept in step by hand.
 *
 * The head needs its own union arm because heads are not given a join row —
 * measured against live data, the head was absent from `QsUserTeam` on 6 of 12
 * teams.
 *
 * `OrgMember.teamId` is deliberately NOT used: it is a single "primary team"
 * pointer (see the POST in api/org/teams/[id]/members), so filtering on it
 * misses the head on 10 of 12 teams and any member whose primary team is
 * elsewhere. Only 135 of 446 active memberships have it set at all.
 */
export async function getTeamOwnerCandidateIds(
  orgId: string,
  teamId: string,
): Promise<string[]> {
  // Resolve the team FIRST and bail if it's trashed or in another org: a
  // soft-deleted team confers no eligibility on anyone. Filtering only the head
  // lookup wasn't enough — the team's stale `QsUserTeam` rows still produced
  // candidates, and because a head often has a join row too, the head came back
  // anyway via that arm (observed on a trashed "Delivery Team").
  const team = await db.qsTeam.findFirst({
    where: { id: teamId, orgId, deletedAt: null },
    select: { headId: true },
  });
  if (!team) return [];

  const joinRows = await db.qsUserTeam.findMany({
    where: { orgId, teamId },
    select: { userId: true },
  });
  const ids = new Set(joinRows.map((r) => r.userId));
  if (team.headId) ids.add(team.headId);
  return [...ids];
}

/**
 * The owner is a member of the selected team.
 *
 * Membership is the union described by `getTeamOwnerCandidateIds` above, which
 * this delegates to so the rule has exactly one definition.
 *
 * KPI deliberately does NOT check this today — it validates only that the team
 * exists — which lets a KPI be filed against a team its owner has nothing to do
 * with. This is new code, so it's enforced from the start.
 */
export async function validateOwnerInTeam(
  orgId: string,
  teamId: string,
  ownerId: string,
): Promise<ValidationResult> {
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!owner) {
    return NextResponse.json({ success: false, error: "Owner not found" }, { status: 404 });
  }

  const candidateIds = await getTeamOwnerCandidateIds(orgId, teamId);
  if (!candidateIds.includes(ownerId)) {
    return NextResponse.json(
      { success: false, error: "Owner must be a member of the selected team" },
      { status: 400 },
    );
  }
  return null;
}

/**
 * At most `MAX_CRITICAL_NUMBERS_PER_TEAM` per team.
 *
 * The cap is a property of the TEAM, not the creator — a user in three teams
 * can create five in each, which is what "5 per team" means. Counted on
 * (orgId, teamId), backed by the matching composite index.
 *
 * `excludeId` is for updates that move a metric to a different team: the row
 * being edited must not count against its own destination.
 *
 * Race note: this is a check-then-insert, so two simultaneous creates could
 * both pass and land a 6th row. Deliberately accepted for v1 — the cap is a
 * product guard-rail, not an invariant, and the alternatives (serializable
 * transaction or a partial unique index on a rank column) cost more than a
 * rare off-by-one is worth here. Revisit if it ever matters.
 */
export async function validateTeamCap(
  orgId: string,
  teamId: string,
  excludeId?: string,
): Promise<ValidationResult> {
  const count = await db.criticalNumber.count({
    where: { orgId, teamId, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (count >= MAX_CRITICAL_NUMBERS_PER_TEAM) {
    return NextResponse.json(
      {
        success: false,
        error: `This team already has ${MAX_CRITICAL_NUMBERS_PER_TEAM} Critical Numbers. Remove one before adding another.`,
      },
      { status: 409 },
    );
  }
  return null;
}

/**
 * The category exists in this org and isn't in the trash.
 *
 * CategoryMaster is shared with OPSP and soft-deletes via `deletedAt`; a
 * trashed category must not be selectable for a new metric even though the row
 * still exists and the FK would happily accept it.
 */
export async function validateCategoryInOrg(
  orgId: string,
  categoryId: string,
): Promise<ValidationResult> {
  const category = await db.categoryMaster.findFirst({
    where: { id: categoryId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!category) {
    return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
  }
  return null;
}

/**
 * The sub-category exists, is in this org, and belongs to the CHOSEN category.
 *
 * The last part is the one that matters: the FK alone would allow a
 * sub-category from an unrelated category, producing a record whose own
 * classification contradicts itself.
 */
export async function validateSubCategory(
  orgId: string,
  categoryId: string,
  subCategoryId: string,
): Promise<ValidationResult> {
  const sub = await db.subCategory.findFirst({
    where: { id: subCategoryId, orgId },
    select: { id: true, categoryId: true },
  });
  if (!sub) {
    return NextResponse.json({ success: false, error: "Sub category not found" }, { status: 404 });
  }
  if (sub.categoryId !== categoryId) {
    return NextResponse.json(
      { success: false, error: "Sub category does not belong to the selected category" },
      { status: 400 },
    );
  }
  return null;
}

/**
 * Run every create-time check in order. Cheapest/most-specific failures first
 * so the caller gets the most useful message: a bad team reads better than a
 * cap error against a team that doesn't exist.
 */
export async function validateCriticalNumberCreate(input: {
  orgId: string;
  teamId: string;
  ownerId: string;
  categoryId: string;
  subCategoryId?: string | null;
}): Promise<ValidationResult> {
  return (
    (await validateTeamInOrg(input.orgId, input.teamId)) ??
    (await validateOwnerInTeam(input.orgId, input.teamId, input.ownerId)) ??
    (await validateCategoryInOrg(input.orgId, input.categoryId)) ??
    (input.subCategoryId
      ? await validateSubCategory(input.orgId, input.categoryId, input.subCategoryId)
      : null) ??
    (await validateTeamCap(input.orgId, input.teamId))
  );
}
