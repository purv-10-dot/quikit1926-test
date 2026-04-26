import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";

export const GET = withAdminAuth(async ({ tenantId }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "settings", tenantId);
  if (blocked) return blocked as NextResponse;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
  const skip = (page - 1) * limit;

  const action = searchParams.get("action");
  const entityType = searchParams.get("entityType");
  const actorId = searchParams.get("actorId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = { tenantId };
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (actorId) where.actorId = actorId;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    db.auditLog.count({ where }),
  ]);

  const actorIds = Array.from(new Set(rows.map((r) => r.actorId)));
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const data = rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    actor: actorById.get(r.actorId) ?? {
      id: r.actorId,
      firstName: "",
      lastName: "",
      email: "",
    },
    actorRole: r.actorRole,
    reason: r.reason,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    changes: r.changes,
    oldValues: r.oldValues,
    newValues: r.newValues,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({
    success: true,
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
