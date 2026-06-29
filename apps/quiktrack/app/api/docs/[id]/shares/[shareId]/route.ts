import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canManageDocSharing, type DocForAccess } from "@/lib/api/docAccess";

/** Update / remove a single per-user document share. Owner or admin only. */

async function loadDoc(orgId: string, docId: string): Promise<DocForAccess | null> {
  const rows = await db.$queryRaw<DocForAccess[]>`
    SELECT id, "projectId", "createdBy", status
    FROM app_quiktrack."QtDoc"
    WHERE id = ${docId} AND "orgId" = ${orgId} AND "isDeleted" = false
    LIMIT 1
  `;
  return rows[0] ?? null;
}

const patchSchema = z.object({ role: z.enum(["viewer", "editor"]) });

export const PATCH = withOrgAuth<{ id: string; shareId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canManageDocSharing(userId, orgId, doc))) {
      return NextResponse.json(
        { success: false, error: "Only the owner or an admin can change sharing." },
        { status: 403 },
      );
    }
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const affected = await db.$executeRaw`
      UPDATE app_quiktrack."QtDocShare"
      SET role = ${parsed.data.role}, "updatedAt" = NOW()
      WHERE id = ${params.shareId} AND "docId" = ${params.id}
    `;
    if (affected === 0) {
      return NextResponse.json({ success: false, error: "Share not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { shareId: params.shareId, role: parsed.data.role } });
  },
);

export const DELETE = withOrgAuth<{ id: string; shareId: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canManageDocSharing(userId, orgId, doc))) {
      return NextResponse.json(
        { success: false, error: "Only the owner or an admin can change sharing." },
        { status: 403 },
      );
    }
    await db.$executeRaw`
      DELETE FROM app_quiktrack."QtDocShare"
      WHERE id = ${params.shareId} AND "docId" = ${params.id}
    `;
    return NextResponse.json({ success: true, data: { shareId: params.shareId } });
  },
);
