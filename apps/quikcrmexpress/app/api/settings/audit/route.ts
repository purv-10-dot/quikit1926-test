import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";

export const runtime = "nodejs";

const querySchema = z.object({
  module: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().trim().min(1).optional(),
  resourceId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "view");

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid query", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const q = parsed.data;
    const where: Record<string, unknown> = { orgId: user.orgId };
    if (q.module) where.module = q.module;
    if (q.action) where.action = q.action;
    if (q.userId) where.userId = q.userId;
    if (q.resourceId) where.resourceId = q.resourceId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      prisma.qceAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.qceAuditLog.count({ where }),
    ]);
    return NextResponse.json({ items, total, page: q.page, pageSize: q.pageSize });
  } catch (e) {
    return errorResponse(e);
  }
}
