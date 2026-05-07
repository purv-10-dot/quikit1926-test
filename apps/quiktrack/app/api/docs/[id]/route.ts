import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * Single-doc routes — also raw-SQL backed because the local Prisma client is
 * sometimes stale on the new `QtDoc` model.
 */

interface DocRow {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  content: string;
  templateKey: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

async function loadDoc(orgId: string, docId: string): Promise<DocRow | null> {
  const rows = await db.$queryRaw<DocRow[]>`
    SELECT id, "orgId", "projectId", title, content, "templateKey",
           "createdBy", "updatedBy", "isDeleted", "createdAt", "updatedAt"
    FROM app_quiktrack."QtDoc"
    WHERE id = ${docId} AND "orgId" = ${orgId} AND "isDeleted" = false
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function userHasProjectAccess(
  userId: string,
  orgId: string,
  projectId: string,
): Promise<{ canRead: boolean; canWrite: boolean }> {
  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { role: true },
  });
  const tenantAdmin = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  const isAdmin = tenantAdmin?.role === "admin" || tenantAdmin?.role === "owner";
  if (isAdmin) return { canRead: true, canWrite: true };
  if (!member) return { canRead: false, canWrite: false };
  const isViewer = member.role === "VIEWER";
  return { canRead: true, canWrite: !isViewer };
}

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const access = await userHasProjectAccess(userId, orgId, doc.projectId);
    if (!access.canRead) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: doc });
  },
);

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().max(2_000_000).optional(),
});

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const access = await userHasProjectAccess(userId, orgId, doc.projectId);
    if (!access.canWrite) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const nextTitle = parsed.data.title ?? doc.title;
    const nextContent = parsed.data.content ?? doc.content;
    await db.$executeRaw`
      UPDATE app_quiktrack."QtDoc"
      SET title = ${nextTitle},
          content = ${nextContent},
          "updatedBy" = ${userId},
          "updatedAt" = NOW()
      WHERE id = ${params.id}
    `;
    return NextResponse.json({
      success: true,
      data: { ...doc, title: nextTitle, content: nextContent, updatedBy: userId },
    });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const access = await userHasProjectAccess(userId, orgId, doc.projectId);
    if (!access.canWrite) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    await db.$executeRaw`
      UPDATE app_quiktrack."QtDoc"
      SET "isDeleted" = true, "updatedBy" = ${userId}, "updatedAt" = NOW()
      WHERE id = ${params.id}
    `;
    return NextResponse.json({ success: true, data: { id: params.id } });
  },
);
