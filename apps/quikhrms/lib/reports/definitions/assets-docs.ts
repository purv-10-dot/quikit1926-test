import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName } from "../format";
import { employeeBasics } from "../payroll-data";

export const assetsDocsReports: ReportDefinition[] = [
  {
    key: "document-expiry",
    label: "Document Expiry",
    description: "Documents with an expiry date (contracts, IDs, certificates).",
    category: "Assets & Documents",
    async run({ orgId }) {
      const docs = await prisma.document.findMany({ where: { orgId, deletedAt: null, expiryDate: { not: null } }, orderBy: { expiryDate: "asc" } });
      const empMap = await employeeBasics(orgId, docs.map((d) => d.employeeId).filter(Boolean) as string[]);
      return {
        title: "Document Expiry",
        columns: [
          { key: "title", label: "Document", width: 28 },
          { key: "category", label: "Category", width: 16 },
          { key: "employee", label: "Employee", width: 22 },
          { key: "version", label: "Version", width: 8 },
          { key: "status", label: "Status", width: 12 },
          { key: "expiryDate", label: "Expiry Date", width: 14 },
        ],
        rows: docs.map((d) => {
          const e = d.employeeId ? empMap.get(d.employeeId) : undefined;
          return { title: d.title, category: d.category, employee: e ? fullName(e) : "(Company)", version: d.version, status: d.status, expiryDate: fmtDate(d.expiryDate) };
        }),
      };
    },
  },
  {
    key: "document-acknowledgment",
    label: "Document Acknowledgment",
    description: "Policy/document acknowledgment status per employee.",
    category: "Assets & Documents",
    async run({ orgId }) {
      const acks = await prisma.documentAcknowledgment.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 10000 });
      const docIds = [...new Set(acks.map((a) => a.documentId))];
      const docs = docIds.length ? await prisma.document.findMany({ where: { orgId, id: { in: docIds } }, select: { id: true, title: true } }) : [];
      const docMap = new Map(docs.map((d) => [d.id, d.title]));
      const empMap = await employeeBasics(orgId, acks.map((a) => a.employeeId));
      return {
        title: "Document Acknowledgment",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "document", label: "Document", width: 28 },
          { key: "status", label: "Status", width: 14 },
          { key: "acknowledgedAt", label: "Acknowledged On", width: 16 },
        ],
        rows: acks.map((a) => {
          const e = empMap.get(a.employeeId);
          return { code: e?.employeeCode ?? "", name: fullName(e), document: docMap.get(a.documentId) ?? "", status: a.status, acknowledgedAt: fmtDate(a.acknowledgedAt) };
        }),
      };
    },
  },
];
