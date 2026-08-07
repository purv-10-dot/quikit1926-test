import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { assertDocumentParent } from "@/lib/services/documents/ref-config";
import type { DocumentRefType } from "@/lib/services/documents/types";
import { toFolderDto } from "./serialize-folder";
import type { FolderScope, FolderTreeNodeDto } from "./types";
import { FolderServiceError, normalizeScope, scopeWhere } from "./scope";

export async function listFolderTreeChildren(
  user: SessionUser,
  scope: FolderScope,
  parentFolderId: string | null,
): Promise<FolderTreeNodeDto[]> {
  const { refType, refId } = normalizeScope(scope);
  if (refType && refId) {
    await assertDocumentParent(user, refType, refId);
  }

  const rows = await prisma.qcfDocumentFolder.findMany({
    where: {
      ...scopeWhere(user.orgId, scope),
      parentFolderId,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      orgId: true,
      name: true,
      parentFolderId: true,
      refType: true,
      refId: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      _count: {
        select: {
          children: { where: { deletedAt: null } },
        },
      },
    },
  });

  return rows.map((r) => ({
    ...toFolderDto(r),
    hasChildren: r._count.children > 0,
  }));
}

export async function searchFolders(
  orgId: string,
  scope: FolderScope,
  q: string,
  limit = 50,
): Promise<FolderTreeNodeDto[]> {
  const rows = await prisma.qcfDocumentFolder.findMany({
    where: {
      ...scopeWhere(orgId, scope),
      name: { contains: q.trim(), mode: "insensitive" },
    },
    take: limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      orgId: true,
      name: true,
      parentFolderId: true,
      refType: true,
      refId: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      _count: {
        select: {
          children: { where: { deletedAt: null } },
        },
      },
    },
  });

  return rows.map((r) => ({
    ...toFolderDto(r),
    hasChildren: r._count.children > 0,
  }));
}

export async function assertFolderInScope(
  orgId: string,
  folderId: string,
  scope: FolderScope,
): Promise<{ refType: DocumentRefType | null; refId: string | null }> {
  const folder = await prisma.qcfDocumentFolder.findFirst({
    where: { id: folderId, orgId, deletedAt: null },
  });
  if (!folder) throw new FolderServiceError("Folder not found", 404);

  const expected = normalizeScope(scope);
  if (folder.refType !== expected.refType || folder.refId !== expected.refId) {
    throw new FolderServiceError("Folder not in this scope", 404);
  }
  return {
    refType: folder.refType as DocumentRefType | null,
    refId: folder.refId,
  };
}
