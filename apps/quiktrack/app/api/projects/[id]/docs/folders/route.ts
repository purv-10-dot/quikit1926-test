import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Doc folders API — raw SQL for the same reason as the docs routes (the local
 * Prisma client is sometimes stale for the QtDoc* models on Windows). Folders
 * are single-level; docs reference a folder via QtDoc.folderId (null = root).
 */

interface FolderRow {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  docCount: number;
}

/**
 * The `QtDocFolder` table / `folderId` column may not exist yet on an
 * environment where the migration hasn't been applied (the build pipeline
 * doesn't run `migrate deploy`). Detect Postgres "undefined table/column" so
 * the GET can degrade to an empty folder list instead of 500-ing the whole
 * Pages tab. Writes do NOT swallow this — see POST.
 */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  // 42P01 undefined_table, 42703 undefined_column
  return code === "42P01" || code === "42703";
}

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId, userId }) => {
    try {
      // docCount via a correlated subquery (cast to int — COUNT returns
      // bigint, which Prisma would otherwise surface as a BigInt). Lets the UI
      // show per-folder page counts without loading any docs. The count mirrors
      // the list's visibility rule — published docs + the caller's own drafts —
      // so another user's draft never leaks into the folder count.
      const rows = await db.$queryRaw<FolderRow[]>`
        SELECT f.id, f.name, f."sortOrder", f."createdAt",
               (SELECT COUNT(*)::int FROM app_quiktrack."QtDoc" d
                 WHERE d."folderId" = f.id AND d."isDeleted" = false
                   AND (d.status = 'published' OR d."createdBy" = ${userId})) AS "docCount"
        FROM app_quiktrack."QtDocFolder" f
        WHERE f."projectId" = ${projectId} AND f."isDeleted" = false
        ORDER BY f.name ASC
      `;
      return NextResponse.json({ success: true, data: rows });
    } catch (err) {
      if (isMissingRelation(err)) {
        return NextResponse.json({ success: true, data: [] });
      }
      throw err;
    }
  },
  { paramKey: "id" },
);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const POST = withProjectAccess<{ id: string }>(
  async ({ projectId, orgId, userId }, req) => {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const id = randomUUID();
    const name = parsed.data.name;

    await db.$executeRaw`
      INSERT INTO app_quiktrack."QtDocFolder"
        (id, "orgId", "projectId", name, "sortOrder",
         "createdBy", "updatedBy", "isDeleted", "createdAt", "updatedAt")
      VALUES
        (${id}, ${orgId}, ${projectId}, ${name}, 0,
         ${userId}, ${userId}, false, NOW(), NOW())
    `;
    return NextResponse.json(
      {
        success: true,
        data: { id, name, sortOrder: 0, createdAt: new Date().toISOString(), docCount: 0 },
      },
      { status: 201 },
    );
  },
  { paramKey: "id", requirePermission: { resource: "Doc", action: "create" } },
);
