import { prisma } from "@/lib/db/prisma";
import { REF_CONFIG } from "./ref-config";
import type { DocumentDto, DocumentRefType } from "./types";
import { isDocumentRefType } from "./types";

export async function enrichRelatedLabels(
  tenantId: string,
  docs: DocumentDto[],
): Promise<DocumentDto[]> {
  if (docs.length === 0) return docs;

  const byType = new Map<DocumentRefType, string[]>();
  for (const d of docs) {
    if (!isDocumentRefType(d.refType)) continue;
    const list = byType.get(d.refType) ?? [];
    list.push(d.refId);
    byType.set(d.refType, list);
  }

  const labels = new Map<string, string>();

  for (const [refType, ids] of byType) {
    const unique = [...new Set(ids)];
    switch (refType) {
      case "lead": {
        const rows = await prisma.qcfLead.findMany({
          where: { tenantId, id: { in: unique } },
          select: { id: true, name: true },
        });
        for (const r of rows) labels.set(`${refType}:${r.id}`, r.name);
        break;
      }
      case "account": {
        const rows = await prisma.qcfAccount.findMany({
          where: { tenantId, id: { in: unique } },
          select: { id: true, name: true },
        });
        for (const r of rows) labels.set(`${refType}:${r.id}`, r.name);
        break;
      }
      case "opportunity": {
        const rows = await prisma.qcfOpportunity.findMany({
          where: { tenantId, id: { in: unique } },
          select: { id: true, name: true },
        });
        for (const r of rows) labels.set(`${refType}:${r.id}`, r.name);
        break;
      }
      case "quote": {
        const rows = await prisma.qcfQuote.findMany({
          where: { tenantId, id: { in: unique } },
          select: { id: true, quoteNumber: true },
        });
        for (const r of rows) labels.set(`${refType}:${r.id}`, r.quoteNumber);
        break;
      }
      case "order": {
        const rows = await prisma.qcfOrder.findMany({
          where: { tenantId, id: { in: unique } },
          select: { id: true, orderNumber: true },
        });
        for (const r of rows) labels.set(`${refType}:${r.id}`, r.orderNumber);
        break;
      }
    }
  }

  return docs.map((d) => {
    if (d.refType === "global") {
      return {
        ...d,
        relatedLabel: "Global",
        relatedHref: "/documents",
      };
    }
    if (!isDocumentRefType(d.refType)) {
      return {
        ...d,
        relatedLabel: d.refType,
        relatedHref: null,
      };
    }
    const key = `${d.refType}:${d.refId}`;
    const cfg = REF_CONFIG[d.refType];
    return {
      ...d,
      relatedLabel: labels.get(key) ?? `${d.refType} ${d.refId.slice(0, 8)}…`,
      relatedHref: cfg.parentPath(d.refId),
    };
  });
}
