import { db } from "@/lib/db";

/**
 * Per-user "starred" (favourite) spaces. Backed by QtProjectStar
 * (userId + projectId). The generated Prisma client on the dev box is stale and
 * doesn't know this table yet, so we use raw SQL (parameterised) here until the
 * integration owner regenerates the client in CI. Every query is org-scoped.
 */

/** The project ids this user has starred in this org. */
export async function listStarredProjectIds(orgId: string, userId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ projectId: string }[]>`
    SELECT s."projectId"
    FROM app_quiktrack."QtProjectStar" s
    JOIN app_quiktrack."QtProject" p ON p.id = s."projectId"
    WHERE s."orgId" = ${orgId} AND s."userId" = ${userId}
      AND p."isDeleted" = false
  `;
  return rows.map((r) => r.projectId);
}

/**
 * Star / un-star a project for a user. Verifies the project exists in this org
 * first (so a bad id can't create an orphan star). Returns the new starred
 * state, or null when the project doesn't exist in the org.
 */
export async function setProjectStarred(
  orgId: string,
  userId: string,
  projectId: string,
  starred: boolean,
): Promise<boolean | null> {
  const project = await db.qtProject.findFirst({
    where: { id: projectId, orgId, isDeleted: false },
    select: { id: true },
  });
  if (!project) return null;

  if (starred) {
    await db.$executeRaw`
      INSERT INTO app_quiktrack."QtProjectStar" ("orgId", "userId", "projectId")
      VALUES (${orgId}, ${userId}, ${projectId})
      ON CONFLICT ("userId", "projectId") DO NOTHING
    `;
  } else {
    await db.$executeRaw`
      DELETE FROM app_quiktrack."QtProjectStar"
      WHERE "userId" = ${userId} AND "projectId" = ${projectId}
    `;
  }
  return starred;
}
