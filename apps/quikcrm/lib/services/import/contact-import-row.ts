import type { CrmContact } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";

export type ContactImportRowInput = {
  orgId: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  ownerName?: string | null;
  city?: string | null;
  contactStage?: string | null;
  source?: string | null;
  accountName?: string | null;
};

/** Upsert a contact row — dedup by email when present, otherwise always insert. */
export async function upsertImportedContactRow(
  data: ContactImportRowInput,
): Promise<CrmContact> {
  let accountId: string | null = null;
  if (data.accountName) {
    const account = await prisma.crmAccount.findFirst({
      where: { orgId: data.orgId, name: data.accountName, deletedAt: null },
      select: { id: true },
    });
    accountId = account?.id ?? null;
  }

  const payload = {
    lastName: data.lastName || null,
    phone: data.phone || null,
    title: data.title || null,
    ownerName: data.ownerName || null,
    city: data.city || null,
    contactStage: data.contactStage || null,
    source: data.source || null,
    accountId,
  };

  if (data.email) {
    const existing = await prisma.crmContact.findFirst({
      where: { orgId: data.orgId, email: data.email, deletedAt: null },
    });
    if (existing) {
      return prisma.crmContact.update({
        where: { id: existing.id },
        data: payload,
      });
    }
  }

  return prisma.crmContact.create({
    data: {
      orgId: data.orgId,
      firstName: data.firstName,
      email: data.email || null,
      ...payload,
    },
  });
}
