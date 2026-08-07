import { prisma } from "@/lib/db/prisma";
import { accountScopeFilter, getScope } from "@/lib/auth/account-acl";
import type { SessionUser } from "@/types/permission";
import { REF_CONFIG } from "@/lib/services/documents/ref-config";
import { DOCUMENT_REF_TYPES, type DocumentRefType } from "@/lib/services/documents/types";
import type { ExplorerModuleKey } from "./explorer-location";
export { getModuleLabel, EXPLORER_MODULE_ORDER } from "./module-labels";

export interface EntityLabelRow {
  refType: DocumentRefType;
  refId: string;
  label: string;
  href: string;
}

export async function resolveEntityLabels(
  user: SessionUser,
  refType: DocumentRefType,
  refIds: string[],
): Promise<Map<string, EntityLabelRow>> {
  const unique = [...new Set(refIds)];
  const out = new Map<string, EntityLabelRow>();
  if (unique.length === 0) return out;

  const { tenantId } = user;
  const acl = await accountScopeFilter(user);

  switch (refType) {
    case "lead": {
      const rows = await prisma.qcfLead.findMany({
        where: {
          tenantId,
          id: { in: unique },
          ...(acl ? { AND: [acl] } : {}),
        },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        out.set(r.id, {
          refType,
          refId: r.id,
          label: r.name,
          href: REF_CONFIG.lead.parentPath(r.id),
        });
      }
      break;
    }
    case "account": {
      const scope = await getScope(user);
      const allowedIds = scope.unrestricted
        ? unique
        : unique.filter((id) => scope.allowedAccountIds.includes(id));
      const rows = await prisma.qcfAccount.findMany({
        where: { tenantId, id: { in: allowedIds } },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        out.set(r.id, {
          refType,
          refId: r.id,
          label: r.name,
          href: REF_CONFIG.account.parentPath(r.id),
        });
      }
      break;
    }
    case "opportunity": {
      const rows = await prisma.qcfOpportunity.findMany({
        where: {
          tenantId,
          id: { in: unique },
          ...(acl ? { AND: [acl] } : {}),
        },
        select: { id: true, name: true },
      });
      for (const r of rows) {
        out.set(r.id, {
          refType,
          refId: r.id,
          label: r.name,
          href: REF_CONFIG.opportunity.parentPath(r.id),
        });
      }
      break;
    }
    case "quote": {
      const rows = await prisma.qcfQuote.findMany({
        where: { tenantId, id: { in: unique } },
        select: { id: true, quoteNumber: true },
      });
      for (const r of rows) {
        out.set(r.id, {
          refType,
          refId: r.id,
          label: r.quoteNumber,
          href: REF_CONFIG.quote.parentPath(r.id),
        });
      }
      break;
    }
    case "order": {
      const rows = await prisma.qcfOrder.findMany({
        where: { tenantId, id: { in: unique } },
        select: { id: true, orderNumber: true },
      });
      for (const r of rows) {
        out.set(r.id, {
          refType,
          refId: r.id,
          label: r.orderNumber,
          href: REF_CONFIG.order.parentPath(r.id),
        });
      }
      break;
    }
  }

  return out;
}

/** Distinct entity ids that have folders and/or documents for a module. */
export async function listEntityIdsForModule(
  user: SessionUser,
  module: ExplorerModuleKey,
): Promise<string[]> {
  const { tenantId } = user;

  if (module === "global") {
    return [];
  }

  const refType = module as DocumentRefType;
  if (!DOCUMENT_REF_TYPES.includes(refType)) return [];

  const [folderRows, docRows] = await Promise.all([
    prisma.qcfDocumentFolder.findMany({
      where: { tenantId, refType, refId: { not: null }, deletedAt: null },
      select: { refId: true },
      distinct: ["refId"],
    }),
    prisma.qcfDocument.findMany({
      where: { tenantId, refType, deletedAt: null },
      select: { refId: true },
      distinct: ["refId"],
    }),
  ]);

  const ids = new Set<string>();
  for (const r of folderRows) if (r.refId) ids.add(r.refId);
  for (const r of docRows) ids.add(r.refId);

  const labels = await resolveEntityLabels(user, refType, [...ids]);
  return [...labels.keys()].sort((a, b) => {
    const la = labels.get(a)?.label ?? a;
    const lb = labels.get(b)?.label ?? b;
    return la.localeCompare(lb);
  });
}
