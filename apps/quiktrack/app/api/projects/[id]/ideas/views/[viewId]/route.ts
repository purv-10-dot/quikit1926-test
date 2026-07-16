import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Update a discovery idea VIEW's saved config — currently the visible column set
 * ("Save for everyone"). Gated on Project:update (Space Admin / project admin;
 * org+app admins bypass), so ordinary members can tweak columns locally but only
 * admins persist the shared view.
 */

const patchViewSchema = z.object({
  columns: z.array(z.string().min(1)).min(1).max(50).optional(),
  sort: z.array(z.object({
    key: z.string().min(1),
    dir: z.enum(["asc", "desc"]),
  })).max(10).optional(),
  filters: z.array(z.object({
    key: z.string().min(1),
    op: z.string().min(1).max(20),
    values: z.array(z.union([z.string(), z.number(), z.boolean()])).max(200),
  })).max(20).optional(),
  // null clears grouping; object sets the group field.
  groupBy: z.object({ key: z.string().min(1), hideEmpty: z.boolean().optional() }).nullable().optional(),
  display: z.object({
    rowNumbers: z.boolean().optional(),
    rowColor: z.object({ key: z.string().min(1), style: z.enum(["background", "highlight"]) }).nullable().optional(),
  }).optional(),
  pinnedFields: z.array(z.string().min(1)).max(50).optional(),
  description: z.string().max(20000).optional(),
}).refine(
  (d) => d.columns !== undefined || d.sort !== undefined || d.filters !== undefined || d.groupBy !== undefined || d.display !== undefined || d.pinnedFields !== undefined || d.description !== undefined,
  { message: "Nothing to update" },
);

export const PATCH = withProjectAccess<{ id: string; viewId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = patchViewSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const view = await db.qtIdeaView.findFirst({
      where: { id: params.viewId, orgId, projectId, isDeleted: false },
      select: { id: true, config: true },
    });
    if (!view) {
      return NextResponse.json({ success: false, error: "View not found" }, { status: 404 });
    }

    const config = {
      ...(view.config as Record<string, unknown> | null ?? {}),
      ...(parsed.data.columns !== undefined ? { columns: parsed.data.columns } : {}),
      ...(parsed.data.sort !== undefined ? { sort: parsed.data.sort } : {}),
      ...(parsed.data.filters !== undefined ? { filters: parsed.data.filters } : {}),
      ...(parsed.data.groupBy !== undefined ? { groupBy: parsed.data.groupBy } : {}),
      ...(parsed.data.display !== undefined
        ? { display: { ...((view.config as { display?: Record<string, unknown> } | null)?.display ?? {}), ...parsed.data.display } }
        : {}),
      ...(parsed.data.pinnedFields !== undefined ? { pinnedFields: parsed.data.pinnedFields } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    };
    const updated = await db.qtIdeaView.update({
      where: { id: params.viewId },
      data: { config, updatedBy: userId },
      select: { id: true, config: true },
    });
    return NextResponse.json({ success: true, data: updated });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);
