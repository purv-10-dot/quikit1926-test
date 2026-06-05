/**
 * /api/auto-reply/rules/[id] — GET, PATCH, DELETE.
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { UpdateRuleSchema } from "@/lib/auto-reply/types";

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const rule = await db.autoReplyRule.findFirst({
      where: { id: params.id, orgId },
    });
    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: { rule } });
  },
);

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const body = await req.json().catch(() => null);
    const parsed = UpdateRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid payload" },
        { status: 422 },
      );
    }
    const patch = parsed.data;

    const existing = await db.autoReplyRule.findFirst({
      where: { id: params.id, orgId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const nextReplyMode = patch.replyMode ?? existing.replyMode;
    const nextTriggerType = patch.triggerType ?? existing.triggerType;

    // Coerce mode-specific fields so a switch from AI → TEMPLATE clears
    // toneGuidance and vice versa. Without this, snapshot drift bites the
    // responder later (v1 had this exact bug — see analysis Q9).
    const templateBody =
      nextReplyMode === "TEMPLATE"
        ? patch.templateBody !== undefined
          ? patch.templateBody
          : existing.templateBody
        : null;
    const toneGuidance =
      nextReplyMode === "AI"
        ? patch.toneGuidance !== undefined
          ? patch.toneGuidance
          : existing.toneGuidance
        : null;
    const keywords =
      nextTriggerType === "KEYWORD_MATCH"
        ? patch.keywords !== undefined
          ? patch.keywords
          : existing.keywords
        : [];

    const rule = await db.autoReplyRule.update({
      where: { id: params.id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.triggerType !== undefined ? { triggerType: patch.triggerType } : {}),
        ...(patch.replyMode !== undefined ? { replyMode: patch.replyMode } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        templateBody,
        toneGuidance,
        keywords,
        ...(patch.keywordMatch !== undefined ? { keywordMatch: patch.keywordMatch } : {}),
        ...(patch.caseSensitive !== undefined ? { caseSensitive: patch.caseSensitive } : {}),
        ...(patch.cooldownMinutes !== undefined ? { cooldownMinutes: patch.cooldownMinutes } : {}),
        ...(patch.maxRepliesPerDay !== undefined ? { maxRepliesPerDay: patch.maxRepliesPerDay } : {}),
        updatedBy: userId ?? null,
      },
    });

    return NextResponse.json({ success: true, data: { rule } });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const existing = await db.autoReplyRule.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    await db.autoReplyRule.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  },
);
