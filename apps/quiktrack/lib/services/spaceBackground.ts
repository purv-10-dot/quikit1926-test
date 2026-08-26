import { db } from "@/lib/db";
import type { SpaceBackground } from "@/lib/spaceBackgrounds";
import { isValidBackground } from "@/lib/spaceBackgrounds";

/**
 * Read/write `QtProject.background`.
 *
 * Raw SQL for the same reason as `tabConfig` in `app/api/projects/[id]/route.ts`
 * and the whole of `projectStars.ts`: the generated Prisma client on the dev box
 * is stale and doesn't know this column yet. Every statement is parameterised
 * and org-scoped.
 */

/** The stored background for a project, or null when unset / project missing. */
export async function getSpaceBackground(
  orgId: string,
  projectId: string,
): Promise<SpaceBackground | null> {
  const rows = await db.$queryRaw<{ background: unknown }[]>`
    SELECT "background" FROM app_quiktrack."QtProject"
    WHERE "id" = ${projectId} AND "orgId" = ${orgId}
    LIMIT 1
  `;
  const raw = rows[0]?.background ?? null;
  // Defensive: a row written before this shape existed (or hand-edited) must
  // not crash the header — treat anything unrecognised as "no background".
  return isValidBackground(raw) ? raw : null;
}

/**
 * Set (or clear, with `null`) a project's background. Returns false when the
 * project doesn't exist in this org, so the caller can 404 instead of silently
 * succeeding on a no-op UPDATE.
 */
export async function setSpaceBackground(
  orgId: string,
  userId: string,
  projectId: string,
  background: SpaceBackground | null,
): Promise<boolean> {
  const json = background === null ? null : JSON.stringify(background);
  const updated = await db.$executeRaw`
    UPDATE app_quiktrack."QtProject"
    SET "background" = ${json}::jsonb, "updatedBy" = ${userId}
    WHERE "id" = ${projectId} AND "orgId" = ${orgId} AND "isDeleted" = false
  `;
  return updated > 0;
}
