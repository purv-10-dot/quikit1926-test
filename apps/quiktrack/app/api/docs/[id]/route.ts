import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import type { Action } from "@/lib/api/permissionsRegistry";

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

/**
 * Doc permission: global admins (tenant/app) bypass; everyone else is gated by
 * their custom project role (Doc:view / Doc:update / Doc:delete). Replaces the
 * old legacy-VIEWER + org-tier check.
 */
async function canDoc(
  userId: string,
  orgId: string,
  projectId: string,
  action: Action,
): Promise<boolean> {
  if (await hasAdminAccess(userId, orgId)) return true;
  return userCanInProject(userId, orgId, projectId, "Doc", action);
}

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const doc = await loadDoc(orgId, params.id);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (!(await canDoc(userId, orgId, doc.projectId, "view"))) {
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
    if (!(await canDoc(userId, orgId, doc.projectId, "update"))) {
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
    if (!(await canDoc(userId, orgId, doc.projectId, "delete"))) {
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
