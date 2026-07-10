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
      // Resolve actor ids → readable names (userId is the Employee.id) so the
      // export is legible, not a wall of ids.
      const actorIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))] as string[];
      const actors = actorIds.length
        ? await prisma.employee.findMany({
            where: { orgId, id: { in: actorIds } },
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          })
        : [];
      const actorMap = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName} (${a.employeeCode})`]));

      const esc = (v: unknown): string => {
        const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      };
      // Every field on the audit record, including the changes diff + metadata.
      const headers = ["Log ID", "Timestamp", "Actor ID", "Actor", "Action", "Entity", "Entity ID", "Changes", "Metadata", "IP Address", "User Agent"];
      const rows = logs.map((l) => [
        l.id,
        l.createdAt.toISOString(),
        l.userId ?? "",
        (l.userId && actorMap.get(l.userId)) || l.userId || "",
        l.action,
        l.entityType,
        l.entityId ?? "",
        l.changes ?? "",
        l.metadata ?? "",
        l.ipAddress ?? "",
        l.userAgent ?? "",
      ]);
      const csv = "﻿" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
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
