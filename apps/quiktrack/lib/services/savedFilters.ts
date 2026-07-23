import { db } from "@/lib/db";

/**
 * Saved-filter service. The Prisma client can't be regenerated on this dev
 * machine (Windows DLL EPERM on `prisma generate`), so QtSavedFilter isn't on
 * the typed client yet — all access goes through parameterized raw SQL against
 * the app_quiktrack."QtSavedFilter" table (created via prisma db execute).
 * Swap these for `db.qtSavedFilter.*` once the client is regenerated.
 */

export type FilterVisibility = "private" | "org" | "space" | "user";

export interface SavedFilterDTO {
  id: string;
  name: string;
  description: string | null;
  criteria: unknown;
  visibility: FilterVisibility;
  viewerIds: string[];
  starred: boolean;
  isOwner: boolean;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  description: string | null;
  criteria: unknown;
  visibility: string;
  viewerIds: string[] | null;
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const T = 'app_quiktrack."QtSavedFilter"';

const VISIBILITIES: FilterVisibility[] = ["private", "org", "space", "user"];
function normVisibility(v: string): FilterVisibility {
  return (VISIBILITIES as string[]).includes(v) ? (v as FilterVisibility) : "private";
}

function serialize(row: Row, viewerId: string): SavedFilterDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    criteria: row.criteria,
    visibility: normVisibility(row.visibility),
    viewerIds: row.viewerIds ?? [],
    starred: !!row.starred,
    isOwner: row.userId === viewerId,
    ownerUserId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Project ids the user is a member of — used to resolve "space" visibility. */
async function memberProjectIds(orgId: string, userId: string): Promise<string[]> {
  const rows = await db.qtProject.findMany({
    where: { orgId, isDeleted: false, members: { some: { userId, isDeleted: false } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Filters the caller can see: their own (any visibility) + org-shared ones. */
export async function listSavedFilters(orgId: string, userId: string): Promise<SavedFilterDTO[]> {
  const projectIds = await memberProjectIds(orgId, userId);
  // Visible when: mine, org-wide, a "space" filter targeting a project I'm in,
  // or a "user" filter that names me. `&&` is Postgres array-overlap.
  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT * FROM ${T}
       WHERE "orgId" = $1 AND "isDeleted" = false
         AND (
           "userId" = $2
           OR "visibility" = 'org'
           OR ("visibility" = 'space' AND "viewerIds" && $3::text[])
           OR ("visibility" = 'user' AND $2 = ANY("viewerIds"))
         )
       ORDER BY "name" ASC`,
    orgId,
    userId,
    projectIds,
  );
  return rows.map((r) => serialize(r, userId));
}

/** Only the caller's own starred filters — powers the sidebar "Starred" group. */
export async function listStarredSavedFilters(orgId: string, userId: string): Promise<SavedFilterDTO[]> {
  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT * FROM ${T}
       WHERE "orgId" = $1 AND "userId" = $2 AND "isDeleted" = false AND "starred" = true
       ORDER BY "name" ASC`,
    orgId,
    userId,
  );
  return rows.map((r) => serialize(r, userId));
}

export async function getSavedFilter(
  orgId: string,
  userId: string,
  id: string,
): Promise<SavedFilterDTO | null> {
  const projectIds = await memberProjectIds(orgId, userId);
  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT * FROM ${T}
       WHERE "id" = $1 AND "orgId" = $2 AND "isDeleted" = false
         AND (
           "userId" = $3
           OR "visibility" = 'org'
           OR ("visibility" = 'space' AND "viewerIds" && $4::text[])
           OR ("visibility" = 'user' AND $3 = ANY("viewerIds"))
         )
       LIMIT 1`,
    id,
    orgId,
    userId,
    projectIds,
  );
  return rows[0] ? serialize(rows[0], userId) : null;
}

export async function createSavedFilter(
  orgId: string,
  userId: string,
  input: {
    name: string;
    description?: string | null;
    criteria: unknown;
    visibility: FilterVisibility;
    viewerIds?: string[];
  },
): Promise<SavedFilterDTO> {
  const id = `sf_${cuidish()}`;
  // viewerIds only meaningful for space/user.
  const viewerIds = input.visibility === "space" || input.visibility === "user" ? input.viewerIds ?? [] : [];
  const rows = await db.$queryRawUnsafe<Row[]>(
    `INSERT INTO ${T} ("id","orgId","userId","name","description","criteria","visibility","viewerIds","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::text[], CURRENT_TIMESTAMP)
       RETURNING *`,
    id,
    orgId,
    userId,
    input.name,
    input.description ?? null,
    JSON.stringify(input.criteria ?? {}),
    input.visibility,
    viewerIds,
  );
  return serialize(rows[0]!, userId);
}

/** Owner-only update. Returns null if not found or not owned by the caller. */
export async function updateSavedFilter(
  orgId: string,
  userId: string,
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    criteria?: unknown;
    visibility?: FilterVisibility;
    viewerIds?: string[];
  },
): Promise<SavedFilterDTO | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  let n = 1;
  if (patch.name !== undefined) { sets.push(`"name" = $${n++}`); args.push(patch.name); }
  if (patch.description !== undefined) { sets.push(`"description" = $${n++}`); args.push(patch.description); }
  if (patch.criteria !== undefined) { sets.push(`"criteria" = $${n++}::jsonb`); args.push(JSON.stringify(patch.criteria)); }
  if (patch.visibility !== undefined) { sets.push(`"visibility" = $${n++}`); args.push(patch.visibility); }
  if (patch.viewerIds !== undefined) { sets.push(`"viewerIds" = $${n++}::text[]`); args.push(patch.viewerIds); }
  sets.push(`"updatedAt" = CURRENT_TIMESTAMP`);
  args.push(id, orgId, userId);
  const rows = await db.$queryRawUnsafe<Row[]>(
    `UPDATE ${T} SET ${sets.join(", ")}
       WHERE "id" = $${n} AND "orgId" = $${n + 1} AND "userId" = $${n + 2} AND "isDeleted" = false
       RETURNING *`,
    ...args,
  );
  return rows[0] ? serialize(rows[0], userId) : null;
}

/** Owner-only soft delete. Returns true if a row was removed. */
export async function deleteSavedFilter(orgId: string, userId: string, id: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `UPDATE ${T} SET "isDeleted" = true, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "orgId" = $2 AND "userId" = $3 AND "isDeleted" = false
       RETURNING "id"`,
    id,
    orgId,
    userId,
  );
  return rows.length > 0;
}

/** Owner-only star toggle. Returns the new starred state, or null if not found. */
export async function setSavedFilterStarred(
  orgId: string,
  userId: string,
  id: string,
  starred: boolean,
): Promise<boolean | null> {
  const rows = await db.$queryRawUnsafe<{ starred: boolean }[]>(
    `UPDATE ${T} SET "starred" = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $2 AND "orgId" = $3 AND "userId" = $4 AND "isDeleted" = false
       RETURNING "starred"`,
    starred,
    id,
    orgId,
    userId,
  );
  return rows[0] ? !!rows[0].starred : null;
}

/** Small collision-resistant id suffix (Math.random is unavailable in some
 *  sandboxes; here we're in a route handler so it's fine). */
function cuidish(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
