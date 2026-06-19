import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, dateRange } from "../format";

export const auditReports: ReportDefinition[] = [
  {
    key: "audit-trail",
    label: "Audit Trail",
    description: "Who changed what: create/update/delete/approve actions across the system.",
    category: "Audit",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const logs = await prisma.hrmsAuditLog.findMany({
        where: { orgId, ...dateRange("createdAt", dateFrom, dateTo) },
        orderBy: { createdAt: "desc" },
        take: 20000,
      });
      return {
        title: "Audit Trail",
        columns: [
          { key: "timestamp", label: "Timestamp", width: 18 },
          { key: "userId", label: "User", width: 20 },
          { key: "action", label: "Action", width: 12 },
          { key: "entityType", label: "Entity", width: 20 },
          { key: "entityId", label: "Entity ID", width: 22 },
          { key: "ip", label: "IP Address", width: 14 },
        ],
        rows: logs.map((l) => ({
          timestamp: l.createdAt.toISOString().slice(0, 19).replace("T", " "),
          userId: l.userId, action: l.action, entityType: l.entityType, entityId: l.entityId ?? "", ip: l.ipAddress ?? "",
        })),
      };
    },
  },
  {
    key: "login-access",
    label: "Login / Access Log",
    description: "Login, logout and data-export events for security review.",
    category: "Audit",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const logs = await prisma.hrmsAuditLog.findMany({
        where: { orgId, action: { in: ["Login", "Logout", "Export"] }, ...dateRange("createdAt", dateFrom, dateTo) },
        orderBy: { createdAt: "desc" },
        take: 20000,
      });
      return {
        title: "Login / Access Log",
        columns: [
          { key: "timestamp", label: "Timestamp", width: 18 },
          { key: "userId", label: "User", width: 20 },
          { key: "action", label: "Action", width: 12 },
          { key: "entityType", label: "Context", width: 20 },
          { key: "ip", label: "IP Address", width: 14 },
        ],
        rows: logs.map((l) => ({
          timestamp: l.createdAt.toISOString().slice(0, 19).replace("T", " "),
          userId: l.userId, action: l.action, entityType: l.entityType, ip: l.ipAddress ?? "",
        })),
      };
    },
  },
  {
    key: "data-import-history",
    label: "Data Import History",
    description: "Bulk-import jobs with row counts and success/failure status.",
    category: "Audit",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const imports = await prisma.dataImport.findMany({
        where: { orgId, ...dateRange("createdAt", dateFrom, dateTo) },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      return {
        title: "Data Import History",
        columns: [
          { key: "date", label: "Date", width: 12 },
          { key: "entityType", label: "Entity", width: 18 },
          { key: "fileName", label: "File", width: 28 },
          { key: "totalRows", label: "Total", width: 10 },
          { key: "successRows", label: "Success", width: 10 },
          { key: "failedRows", label: "Failed", width: 10 },
          { key: "status", label: "Status", width: 16 },
        ],
        rows: imports.map((i) => ({
          date: fmtDate(i.createdAt), entityType: i.entityType, fileName: i.fileName,
          totalRows: i.totalRows, successRows: i.successRows, failedRows: i.failedRows, status: i.status,
        })),
      };
    },
  },
];
