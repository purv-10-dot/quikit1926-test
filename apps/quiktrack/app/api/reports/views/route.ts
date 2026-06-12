import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const KIND = "executive";
const MAX_VIEWS_PER_USER = 25;

const createSchema = z.object({
  name: z.string().min(1).max(80),
  filtersJson: z.record(z.unknown()),
  isPinned: z.boolean().optional(),
});

/**
 * Saved filter+chart presets for the executive reports page. Each row is
 * private to its `userId`; admins do NOT see other users' saved views.
 */
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const views = await db.qtReportView.findMany({
    where: { orgId, userId, kind: KIND },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      filtersJson: true,
      isPinned: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ success: true, data: { views } });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const existing = await db.qtReportView.count({
    where: { orgId, userId, kind: KIND },
  });
  if (existing >= MAX_VIEWS_PER_USER) {
    return NextResponse.json(
      { success: false, error: `You can save up to ${MAX_VIEWS_PER_USER} report views.` },
      { status: 400 },
    );
  }

  const view = await db.qtReportView.create({
    data: {
      orgId,
      userId,
      kind: KIND,
      name: parsed.data.name.trim(),
      filtersJson: parsed.data.filtersJson as Prisma.InputJsonValue,
      isPinned: parsed.data.isPinned ?? false,
    },
    select: {
      id: true,
      name: true,
      filtersJson: true,
      isPinned: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ success: true, data: { view } }, { status: 201 });
});
