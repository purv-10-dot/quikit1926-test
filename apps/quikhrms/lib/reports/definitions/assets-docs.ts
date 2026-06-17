import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num } from "../format";
import { employeeBasics } from "../payroll-data";

async function assetMap(orgId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, { name: string; assetCode: string }>();
  const assets = await prisma.asset.findMany({ where: { orgId, id: { in: unique } }, select: { id: true, name: true, assetCode: true } });
  return new Map(assets.map((a) => [a.id, { name: a.name, assetCode: a.assetCode }]));
}

export const assetsDocsReports: ReportDefinition[] = [
  {
    key: "asset-register",
    label: "Asset Register",
    description: "All assets with code, category, status, condition and value.",
    category: "Assets & Documents",
    async run({ orgId }) {
      const assets = await prisma.asset.findMany({ where: { orgId, deletedAt: null }, orderBy: { assetCode: "asc" } });
      return {
        title: "Asset Register",
        columns: [
          { key: "assetCode", label: "Asset Code", width: 14 },
          { key: "name", label: "Name", width: 24 },
          { key: "category", label: "Category", width: 14 },
          { key: "serial", label: "Serial No.", width: 18 },
          { key: "status", label: "Status", width: 12 },
          { key: "condition", label: "Condition", width: 10 },
          { key: "purchasePrice", label: "Purchase Price", width: 14, money: true },
          { key: "warranty", label: "Warranty Expiry", width: 14 },
        ],
        rows: assets.map((a) => ({
          assetCode: a.assetCode, name: a.name, category: a.category, serial: a.serialNumber ?? "",
          status: a.status, condition: a.condition, purchasePrice: a.purchasePrice == null ? "" : num(a.purchasePrice), warranty: fmtDate(a.warrantyExpiry),
        })),
      };
    },
  },
  {
    key: "asset-allocation",
    label: "Asset Allocation",
    description: "Assets assigned to employees, with return status and overdue flag.",
    category: "Assets & Documents",
    async run({ orgId }) {
      const asg = await prisma.assetAssignment.findMany({ where: { orgId, deletedAt: null }, orderBy: { assignedAt: "desc" }, take: 10000 });
      const [assets, empMap] = await Promise.all([
        assetMap(orgId, asg.map((a) => a.assetId)),
        employeeBasics(orgId, asg.map((a) => a.employeeId)),
      ]);
      return {
        title: "Asset Allocation",
        columns: [
          { key: "assetCode", label: "Asset Code", width: 14 },
          { key: "asset", label: "Asset", width: 22 },
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Assigned To", width: 22 },
          { key: "assignedAt", label: "Assigned On", width: 14 },
          { key: "expectedReturn", label: "Expected Return", width: 14 },
          { key: "returnedAt", label: "Returned On", width: 14 },
          { key: "status", label: "Status", width: 16 },
        ],
        rows: asg.map((a) => {
          const asset = assets.get(a.assetId);
          const e = empMap.get(a.employeeId);
          return { assetCode: asset?.assetCode ?? "", asset: asset?.name ?? "", code: e?.employeeCode ?? "", name: fullName(e), assignedAt: fmtDate(a.assignedAt), expectedReturn: fmtDate(a.expectedReturnDate), returnedAt: fmtDate(a.returnedAt), status: a.status };
        }),
      };
    },
  },
  {
    key: "asset-scrap",
    label: "Asset Scrap / Disposal",
    description: "Scrapped or disposed assets with reason and recovered value.",
    category: "Assets & Documents",
    async run({ orgId }) {
      const scraps = await prisma.assetScrap.findMany({ where: { orgId }, orderBy: { scrapDate: "desc" }, take: 10000 });
      const assets = await assetMap(orgId, scraps.map((s) => s.assetId));
      return {
        title: "Asset Scrap / Disposal",
        columns: [
          { key: "assetCode", label: "Asset Code", width: 14 },
          { key: "asset", label: "Asset", width: 24 },
          { key: "scrapDate", label: "Scrap Date", width: 14 },
          { key: "reason", label: "Reason", width: 28 },
          { key: "scrapValue", label: "Scrap Value", width: 14, money: true },
          { key: "lost", label: "Marked Lost", width: 10 },
        ],
        rows: scraps.map((s) => {
          const asset = assets.get(s.assetId);
          return { assetCode: asset?.assetCode ?? "", asset: asset?.name ?? "", scrapDate: fmtDate(s.scrapDate), reason: s.reason, scrapValue: s.scrapValue == null ? "" : num(s.scrapValue), lost: s.markedLost ? "Yes" : "No" };
        }),
      };
    },
  },
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
