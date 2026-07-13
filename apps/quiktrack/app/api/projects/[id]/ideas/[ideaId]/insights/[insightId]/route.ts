import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject } from "@/lib/api/permissions";

/**
 * Edit / delete an insight on an idea. PATCH edits body/url/impact/labels (owner
 * only). DELETE is a soft delete: owner (Idea:update) may delete their own;
 * deleting someone else's requires Idea:delete. Global admins bypass.
 */

const urlField = z
  .string()
  .max(2048)
  .transform((s) => s.trim())
  .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s))
  .refine((s) => s === "" || z.string().url().safeParse(s).success, "Invalid url")
  .transform((s) => (s === "" ? null : s));

const editSchema = z.object({
  body: z.string().min(1).max(20000).optional(),
  url: urlField.nullable().optional(),
  impact: z.number().int().min(0).max(5).optional(),
  labels: z.array(z.string().min(1).max(64)).max(20).optional(),
}).refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const PATCH = withProjectAccess<{ id: string; ideaId: string; insightId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = editSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const insight = await db.qtIdeaInsight.findFirst({
      where: { id: params.insightId, orgId, ideaId: params.ideaId, isDeleted: false, idea: { projectId } },
      select: { id: true, createdBy: true },
    });
    if (!insight) {
      return NextResponse.json({ success: false, error: "Insight not found" }, { status: 404 });
    }
    if (insight.createdBy !== userId) {
      return NextResponse.json({ success: false, error: "You can only edit your own insight" }, { status: 403 });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.body !== undefined) data.body = parsed.data.body;
    if (parsed.data.url !== undefined) data.url = parsed.data.url;
    if (parsed.data.impact !== undefined) data.impact = parsed.data.impact;
    if (parsed.data.labels !== undefined) data.labels = parsed.data.labels;
    const updated = await db.qtIdeaInsight.update({
      where: { id: params.insightId },
      data,
      select: { id: true, body: true, url: true, impact: true, labels: true, updatedAt: true },
    });
    return NextResponse.json({ success: true, data: updated });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);

export const DELETE = withProjectAccess<{ id: string; ideaId: string; insightId: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }, _req, { params }) => {
    const insight = await db.qtIdeaInsight.findFirst({
      where: { id: params.insightId, orgId, ideaId: params.ideaId, isDeleted: false, idea: { projectId } },
      select: { id: true, createdBy: true },
    });
    if (!insight) {
      return NextResponse.json({ success: false, error: "Insight not found" }, { status: 404 });
    }
    const isOwner = insight.createdBy === userId;
    const canDeleteOthers =
      isTenantAdmin || (await userCanInProject(userId, orgId, projectId, "Idea", "delete"));
    if (!isOwner && !canDeleteOthers) {
      return NextResponse.json({ success: false, error: "Not allowed to delete this insight" }, { status: 403 });
    }
    await db.qtIdeaInsight.update({ where: { id: params.insightId }, data: { isDeleted: true } });
    return NextResponse.json({ success: true, data: { id: params.insightId } });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);
