import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { DOCUMENT_REF_TYPES, type DocumentRefType } from "@/lib/services/documents/types";
import { getDocumentLinkClient } from "@/lib/db/document-link-client";
import type { ExplorerModuleKey } from "./explorer-location";
import { EXPLORER_MODULE_ORDER } from "./module-labels";

/** Global is always listed in the documents sidebar. */
export async function moduleHasDocuments(
  user: SessionUser,
  module: ExplorerModuleKey,
): Promise<boolean> {
  if (module === "global") return true;

  const refType = module as DocumentRefType;
  if (!DOCUMENT_REF_TYPES.includes(refType)) return false;

  const { tenantId } = user;
  const base = { tenantId, refType, deletedAt: null as null };

  const doc = await prisma.qcfDocument.findFirst({
    where: base,
    select: { id: true },
  });
  if (doc) return true;

  const folder = await prisma.qcfDocumentFolder.findFirst({
    where: { ...base, refId: { not: null } },
    select: { id: true },
  });
  if (folder) return true;

  const linkClient = getDocumentLinkClient();
  if (linkClient) {
    const link = await linkClient.findFirst({
      where: { tenantId, refType, deletedAt: null },
      select: { id: true },
    });
    if (link) return true;
  }

  return false;
}

export async function listVisibleExplorerModules(
  user: SessionUser,
): Promise<ExplorerModuleKey[]> {
  const visible: ExplorerModuleKey[] = [];
  for (const module of EXPLORER_MODULE_ORDER) {
    if (await moduleHasDocuments(user, module)) visible.push(module);
  }
  return visible;
}

export async function globalModuleHasTreeChildren(user: SessionUser): Promise<boolean> {
  const folder = await prisma.qcfDocumentFolder.findFirst({
    where: {
      tenantId: user.tenantId,
      refType: null,
      refId: null,
      parentFolderId: null,
      deletedAt: null,
    },
    select: { id: true },
  });
  return Boolean(folder);
}
