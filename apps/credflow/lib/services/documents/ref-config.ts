import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import type { DocumentRefType } from "./types";

export interface RefConfig {
  refType: DocumentRefType;
  module: string;
  parentPath: (id: string) => string;
}

export const REF_CONFIG: Record<DocumentRefType, RefConfig> = {
  lead: { refType: "lead", module: "leads", parentPath: (id) => `/leads/${id}` },
  account: { refType: "account", module: "accounts", parentPath: (id) => `/accounts/${id}` },
  opportunity: {
    refType: "opportunity",
    module: "opportunities",
    parentPath: (id) => `/opportunities/${id}`,
  },
  quote: { refType: "quote", module: "quotes", parentPath: (id) => `/quotes/${id}` },
  order: { refType: "order", module: "quotes", parentPath: (id) => `/orders/${id}` },
};

export class DocumentParentError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 404) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Ensures the parent record exists in-tenant and the user may access it. */
export async function assertDocumentParent(
  user: SessionUser,
  refType: DocumentRefType | "global",
  refId: string,
): Promise<void> {
  const { tenantId } = user;
  if (refType === "global") {
    if (refId !== tenantId) {
      throw new DocumentParentError("Forbidden", 403);
    }
    return;
  }
  switch (refType) {
    case "lead": {
      const lead = await prisma.qcfLead.findFirst({
        where: { id: refId, tenantId },
        select: { accountId: true },
      });
      if (!lead) throw new DocumentParentError("Lead not found");
      await assertAccountAccess(user, lead.accountId);
      return;
    }
    case "account": {
      const acc = await prisma.qcfAccount.findFirst({
        where: { id: refId, tenantId },
        select: { id: true },
      });
      if (!acc) throw new DocumentParentError("Account not found");
      await assertAccountAccess(user, refId);
      return;
    }
    case "opportunity": {
      const opp = await prisma.qcfOpportunity.findFirst({
        where: { id: refId, tenantId },
        select: { accountId: true },
      });
      if (!opp) throw new DocumentParentError("Opportunity not found");
      await assertAccountAccess(user, opp.accountId);
      return;
    }
    case "quote": {
      const quote = await prisma.qcfQuote.findFirst({
        where: { id: refId, tenantId },
        select: { id: true },
      });
      if (!quote) throw new DocumentParentError("Quote not found");
      return;
    }
    case "order": {
      const order = await prisma.qcfOrder.findFirst({
        where: { id: refId, tenantId },
        select: { id: true },
      });
      if (!order) throw new DocumentParentError("Order not found");
      return;
    }
    default:
      throw new DocumentParentError("Invalid reference type", 400);
  }
}
