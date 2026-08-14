import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { assertDocumentParent } from "@/lib/services/documents/ref-config";
import type { DocumentRefType } from "@/lib/services/documents/types";
import {
  deleteEntityDocument,
  listEntityDocuments,
  uploadEntityDocument,
} from "@/lib/services/documents/document-service";
import { deleteCrmUpload, saveCrmUpload } from "@/lib/storage/documents";
import { listLinkedDocumentsForFolder } from "@/lib/services/documents/document-links";
import { toDocumentDto } from "@/lib/services/documents/serialize";
import { resolveUploaderNames } from "@/lib/services/documents/uploader-names";
import { buildFolderBreadcrumbs } from "./breadcrumbs";
import { assertFolderInScope, listFolderTreeChildren } from "./folder-tree";
import { validateFolderMove } from "./move-folder";
import { toFolderDto } from "./serialize-folder";
import {
  FolderServiceError,
  normalizeScope,
  scopeWhere,
  scopesMatch,
} from "./scope";
import type {
  CreateFolderInput,
  FolderContentsResult,
  FolderDto,
  FolderScope,
  MoveDocumentInput,
  MoveFolderInput,
  UpdateFolderInput,
} from "./types";

export { FolderServiceError };

async function assertScopeAccess(user: SessionUser, scope: FolderScope): Promise<void> {
  const { refType, refId } = normalizeScope(scope);
  if (refType && refId) {
    await assertDocumentParent(user, refType, refId);
  }
}

async function resolveParentForCreate(
  orgId: string,
  scope: FolderScope,
  parentFolderId: string | null | undefined,
): Promise<string | null> {
  if (!parentFolderId) return null;
  const parent = await prisma.qceDocumentFolder.findFirst({
    where: { id: parentFolderId, orgId, deletedAt: null },
  });
  if (!parent) throw new FolderServiceError("Parent folder not found", 404);
  const expected = normalizeScope(scope);
  if (!scopesMatch(parent, expected)) {
    throw new FolderServiceError("Parent folder must be in the same scope");
  }
  return parent.id;
}

export async function createFolder(
  user: SessionUser,
  input: CreateFolderInput,
): Promise<FolderDto> {
  const scope: FolderScope = {
    refType: input.refType ?? null,
    refId: input.refId ?? null,
  };
  await assertScopeAccess(user, scope);
  const name = input.name?.trim();
  if (!name) throw new FolderServiceError("Folder name is required");

  const parentFolderId = await resolveParentForCreate(
    user.orgId,
    scope,
    input.parentFolderId ?? null,
  );

  const { refType, refId } = normalizeScope(scope);
  const row = await prisma.qceDocumentFolder.create({
    data: {
      orgId: user.orgId,
      name,
      parentFolderId,
      refType,
      refId,
      createdBy: user.userId,
    },
  });
  return toFolderDto(row);
}

export async function getFolder(user: SessionUser, folderId: string): Promise<FolderDto> {
  const row = await prisma.qceDocumentFolder.findFirst({
    where: { id: folderId, orgId: user.orgId, deletedAt: null },
  });
  if (!row) throw new FolderServiceError("Folder not found", 404);
  await assertScopeAccess(user, {
    refType: row.refType as DocumentRefType | null,
    refId: row.refId,
  });

  const [childFolderCount, fileCount] = await Promise.all([
    prisma.qceDocumentFolder.count({
      where: { orgId: user.orgId, parentFolderId: folderId, deletedAt: null },
    }),
    prisma.qceDocument.count({
      where: { orgId: user.orgId, folderId, deletedAt: null },
    }),
  ]);

  return toFolderDto(row, { childFolderCount, fileCount });
}

export async function renameFolder(
  user: SessionUser,
  folderId: string,
  input: UpdateFolderInput,
): Promise<FolderDto> {
  const existing = await getFolder(user, folderId);
  const name = input.name?.trim();
  if (!name) throw new FolderServiceError("Folder name is required");

  const row = await prisma.qceDocumentFolder.update({
    where: { id: existing.id },
    data: { name },
  });
  return toFolderDto(row);
}

export async function moveFolder(
  user: SessionUser,
  folderId: string,
  input: MoveFolderInput,
): Promise<FolderDto> {
  await getFolder(user, folderId);
  await validateFolderMove(user.orgId, folderId, input.parentFolderId);

  const row = await prisma.qceDocumentFolder.update({
    where: { id: folderId },
    data: { parentFolderId: input.parentFolderId },
  });
  return toFolderDto(row);
}

export async function deleteFolder(
  user: SessionUser,
  folderId: string,
  recursive: boolean,
): Promise<void> {
  await getFolder(user, folderId);

  const childCount = await prisma.qceDocumentFolder.count({
    where: { orgId: user.orgId, parentFolderId: folderId, deletedAt: null },
  });
  const fileCount = await prisma.qceDocument.count({
    where: { orgId: user.orgId, folderId, deletedAt: null },
  });

  if (!recursive && (childCount > 0 || fileCount > 0)) {
    throw new FolderServiceError(
      "Folder is not empty. Delete contents first or use recursive=true",
      409,
    );
  }

  if (recursive) {
    await softDeleteFolderRecursive(user.orgId, folderId);
    return;
  }

  await prisma.qceDocumentFolder.update({
    where: { id: folderId },
    data: { deletedAt: new Date() },
  });
}

async function softDeleteFolderRecursive(orgId: string, folderId: string): Promise<void> {
  const children = await prisma.qceDocumentFolder.findMany({
    where: { orgId, parentFolderId: folderId, deletedAt: null },
    select: { id: true },
  });
  for (const c of children) {
    await softDeleteFolderRecursive(orgId, c.id);
  }

  const now = new Date();
  await prisma.qceDocument.updateMany({
    where: { orgId, folderId, deletedAt: null },
    data: { deletedAt: now },
  });
  await prisma.qceDocumentFolder.update({
    where: { id: folderId },
    data: { deletedAt: now },
  });
}

export interface ListFolderContentsQuery {
  folderId: string | null;
  scope: FolderScope;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listFolderContents(
  user: SessionUser,
  query: ListFolderContentsQuery,
): Promise<FolderContentsResult> {
  await assertScopeAccess(user, query.scope);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  if (query.folderId) {
    await assertFolderInScope(user.orgId, query.folderId, query.scope);
  }

  const folderWhere: Prisma.QceDocumentFolderWhereInput = {
    ...scopeWhere(user.orgId, query.scope),
    parentFolderId: query.folderId,
  };
  if (query.q?.trim()) {
    folderWhere.name = { contains: query.q.trim(), mode: "insensitive" };
  }

  const fileWhere: Prisma.QceDocumentWhereInput = {
    orgId: user.orgId,
    deletedAt: null,
    folderId: query.folderId,
  };
  if (query.scope.refType && query.scope.refId) {
    fileWhere.refType = query.scope.refType;
    fileWhere.refId = query.scope.refId;
  } else if (!query.scope.refType && !query.scope.refId) {
    fileWhere.refType = "global";
    fileWhere.refId = user.orgId;
  }
  if (query.q?.trim()) {
    fileWhere.fileName = { contains: query.q.trim(), mode: "insensitive" };
  }

  const [folderRows, fileRows, totalFolders, totalFiles, folderMeta, breadcrumbs] =
    await Promise.all([
      prisma.qceDocumentFolder.findMany({
        where: folderWhere,
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.qceDocument.findMany({
        where: fileWhere,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.qceDocumentFolder.count({ where: folderWhere }),
      prisma.qceDocument.count({ where: fileWhere }),
      query.folderId
        ? prisma.qceDocumentFolder.findFirst({
            where: { id: query.folderId, orgId: user.orgId, deletedAt: null },
          })
        : Promise.resolve(null),
      buildFolderBreadcrumbs(user.orgId, query.folderId),
    ]);

  const linkRefType = query.scope.refType ?? null;
  const linkRefId = query.scope.refId ?? null;

  const [names, linkedFiles] = await Promise.all([
    resolveUploaderNames(user.orgId, fileRows.map((r) => r.uploadedBy)),
    listLinkedDocumentsForFolder(user, {
      targetFolderId: query.folderId,
      refType: linkRefType,
      refId: linkRefId,
      q: query.q,
    }),
  ]);

  const nativeFiles = fileRows.map((r) => toDocumentDto(r, names.get(r.uploadedBy) ?? null));
  const files = [...nativeFiles, ...linkedFiles];

  return {
    folder: folderMeta ? toFolderDto(folderMeta) : null,
    breadcrumbs,
    folders: folderRows.map((r) => toFolderDto(r)),
    files,
    totalFolders,
    totalFiles: totalFiles + linkedFiles.length,
    page,
    pageSize,
  };
}

export async function uploadFileToFolder(
  user: SessionUser,
  folderId: string,
  file: File,
): Promise<ReturnType<typeof uploadEntityDocument>> {
  const folder = await prisma.qceDocumentFolder.findFirst({
    where: { id: folderId, orgId: user.orgId, deletedAt: null },
  });
  if (!folder) throw new FolderServiceError("Folder not found", 404);

  const refType = folder.refType as DocumentRefType | null;
  const refId = folder.refId;

  if (!refType || !refId) {
    return uploadGlobalFolderDocument(user, folderId, file);
  }

  return uploadEntityDocument(user, refType, refId, file, folderId);
}

/** Upload at Global root (no folder) — refType global, same as tenant library. */
export async function uploadGlobalRootDocument(
  user: SessionUser,
  file: File,
): Promise<Awaited<ReturnType<typeof uploadEntityDocument>>> {
  await assertDocumentParent(user, "global", user.orgId);
  const segment = user.orgId;
  const { storageKey, size, safeName } = await saveCrmUpload(segment, file);
  try {
    const row = await prisma.qceDocument.create({
      data: {
        orgId: user.orgId,
        refType: "global",
        refId: user.orgId,
        folderId: null,
        fileName: safeName,
        contentType: file.type || "application/octet-stream",
        size,
        storageKey,
        uploadedBy: user.userId,
      },
    });
    const names = await resolveUploaderNames(user.orgId, [user.userId]);
    return toDocumentDto(row, names.get(user.userId) ?? null);
  } catch (e: unknown) {
    await deleteCrmUpload(storageKey);
    throw e;
  }
}

/** Files in tenant-global folders (refType/refId null on folder row). */
async function uploadGlobalFolderDocument(
  user: SessionUser,
  folderId: string,
  file: File,
): Promise<Awaited<ReturnType<typeof uploadEntityDocument>>> {
  const segment = folderId;
  const { storageKey, size, safeName } = await saveCrmUpload(segment, file);
  try {
    const row = await prisma.qceDocument.create({
      data: {
        orgId: user.orgId,
        refType: "global",
        refId: user.orgId,
        folderId,
        fileName: safeName,
        contentType: file.type || "application/octet-stream",
        size,
        storageKey,
        uploadedBy: user.userId,
      },
    });
    const names = await resolveUploaderNames(user.orgId, [user.userId]);
    return toDocumentDto(row, names.get(user.userId) ?? null);
  } catch (e: unknown) {
    await deleteCrmUpload(storageKey);
    throw e;
  }
}

export async function moveDocumentToFolder(
  user: SessionUser,
  documentId: string,
  input: MoveDocumentInput,
): Promise<void> {
  const doc = await prisma.qceDocument.findFirst({
    where: { id: documentId, orgId: user.orgId, deletedAt: null },
  });
  if (!doc) throw new FolderServiceError("Document not found", 404);

  await assertDocumentParent(user, doc.refType as DocumentRefType, doc.refId);

  if (input.folderId) {
    const folder = await prisma.qceDocumentFolder.findFirst({
      where: { id: input.folderId, orgId: user.orgId, deletedAt: null },
    });
    if (!folder) throw new FolderServiceError("Folder not found", 404);
    if (folder.refType !== doc.refType || folder.refId !== doc.refId) {
      throw new FolderServiceError("Folder must belong to the same entity");
    }
  }

  await prisma.qceDocument.update({
    where: { id: documentId },
    data: { folderId: input.folderId },
  });
}

export async function listEntityDocumentsInFolder(
  user: SessionUser,
  refType: DocumentRefType,
  refId: string,
  folderId: string | null,
): Promise<ReturnType<typeof listEntityDocuments>> {
  return listEntityDocuments(user, refType, refId, folderId);
}

export async function deleteDocumentInFolder(
  user: SessionUser,
  refType: DocumentRefType,
  refId: string,
  documentId: string,
): Promise<void> {
  return deleteEntityDocument(user, refType, refId, documentId);
}

export { listFolderTreeChildren };
