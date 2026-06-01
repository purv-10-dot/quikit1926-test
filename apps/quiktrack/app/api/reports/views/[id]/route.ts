import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const KIND = "executive";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  filtersJson: z.record(z.unknown()).optional(),
  isPinned: z.boolean().optional(),
});

type RouteParams = { id: string };

export const GET = withOrgAuth<RouteParams>(async ({ orgId, userId }, _req, { params }) => {
  const view = await db.qtReportView.findFirst({
    where: { id: params.id, orgId, userId, kind: KIND },
    select: {
      id: true,
      name: true,
      filtersJson: true,
      isPinned: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!view) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: { view } });
});

export const PATCH = withOrgAuth<RouteParams>(async ({ orgId, userId }, req, { params }) => {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const existing = await db.qtReportView.findFirst({
    where: { id: params.id, orgId, userId, kind: KIND },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const view = await db.qtReportView.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.filtersJson !== undefined
        ? { filtersJson: parsed.data.filtersJson as Prisma.InputJsonValue }
        : {}),
      ...(parsed.data.isPinned !== undefined ? { isPinned: parsed.data.isPinned } : {}),
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
  return NextResponse.json({ success: true, data: { view } });
});

export const DELETE = withOrgAuth<RouteParams>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.qtReportView.findFirst({
    where: { id: params.id, orgId, userId, kind: KIND },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  await db.qtReportView.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, data: { id: params.id } });
});
