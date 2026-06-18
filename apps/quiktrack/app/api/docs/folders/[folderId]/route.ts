import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canDoc } from "@/lib/api/docPermissions";

/**
 * Single doc-folder routes — raw SQL, matching the docs routes. Every query is
 * scoped by `"orgId"` (folders are NOT covered by RLS), so this file is the
 * cross-tenant-write risk: always load + verify org before mutating.
 */

interface FolderRow {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  isDeleted: boolean;
}

async function loadFolder(orgId: string, folderId: string): Promise<FolderRow | null> {
  const rows = await db.$queryRaw<FolderRow[]>`
    SELECT id, "orgId", "projectId", name, "isDeleted"
    FROM app_quiktrack."QtDocFolder"
    WHERE id = ${folderId} AND "orgId" = ${orgId} AND "isDeleted" = false
    LIMIT 1
  `;
  return rows[0] ?? null;
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const PATCH = withOrgAuth<{ folderId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const folder = await loadFolder(orgId, params.folderId);
    if (!folder) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canDoc(userId, orgId, folder.projectId, "update"))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    await db.$executeRaw`
      UPDATE app_quiktrack."QtDocFolder"
      SET name = ${parsed.data.name}, "updatedBy" = ${userId}, "updatedAt" = NOW()
      WHERE id = ${params.folderId} AND "orgId" = ${orgId}
    `;
    return NextResponse.json({
      success: true,
      data: { id: folder.id, name: parsed.data.name },
    });
  },
);

export const DELETE = withOrgAuth<{ folderId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const folder = await loadFolder(orgId, params.folderId);
    if (!folder) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canDoc(userId, orgId, folder.projectId, "delete"))) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
    // Orphan the folder's docs back to root (non-destructive), then soft-delete
    // the folder — in one transaction so a doc never points at a dead folder.
    await db.$transaction([
      db.$executeRaw`
        UPDATE app_quiktrack."QtDoc"
        SET "folderId" = NULL, "updatedAt" = NOW()
        WHERE "folderId" = ${params.folderId} AND "orgId" = ${orgId}
          AND "isDeleted" = false
      `,
      db.$executeRaw`
        UPDATE app_quiktrack."QtDocFolder"
        SET "isDeleted" = true, "updatedBy" = ${userId}, "updatedAt" = NOW()
        WHERE id = ${params.folderId} AND "orgId" = ${orgId}
      `,
    ]);
    return NextResponse.json({ success: true, data: { id: params.folderId } });
  },
);
