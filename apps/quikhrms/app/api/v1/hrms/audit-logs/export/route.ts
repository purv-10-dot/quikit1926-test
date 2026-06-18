import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { exportAuditSchema } from "@/lib/validations/notifications-reports";
import { createAuditLog } from "@/lib/utils/audit";
import type { Prisma } from "@quikit/database";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = exportAuditSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const where: Prisma.AuditLogWhereInput = {
      orgId,
      ...(parsed.data.actorId && { userId: parsed.data.actorId }),
      ...(parsed.data.entityType && { entityType: parsed.data.entityType }),
      ...(parsed.data.action && { action: parsed.data.action as Prisma.EnumAuditActionFilter["equals"] }),
      ...(parsed.data.from || parsed.data.to ? {
        createdAt: {
          ...(parsed.data.from && { gte: new Date(parsed.data.from) }),
          ...(parsed.data.to && { lte: new Date(parsed.data.to) }),
        },
      } : {}),
    };

    const logs = await prisma.hrmsAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 10000 });

    await createAuditLog({ orgId, userId, action: "Export", entityType: "AuditLog", metadata: { count: logs.length } });

    if (parsed.data.format === "CSV") {
      const headers = ["Timestamp", "Actor", "Action", "Entity", "EntityId", "IP"];
      const rows = logs.map((l) => [
        l.createdAt.toISOString(), l.userId, l.action, l.entityType, l.entityId ?? "", l.ipAddress ?? "",
      ]);
      const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="audit_${Date.now()}.csv"` },
      });
    }

    return successResponse({ format: "JSON", count: logs.length, logs });
  } catch (error) {
    console.error("POST /audit-logs/export error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.audit.read"] });
