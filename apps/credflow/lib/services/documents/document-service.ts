import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import {
  deleteCrmUpload,
  getCrmUploadDownloadUrl,
  readCrmUpload,
  resolveStorageSegment,
  saveCrmUpload,
} from "@/lib/storage/documents";
import { FolderServiceError } from "@/lib/services/document-folders/scope";
import { assertDocumentParent, DocumentParentError } from "./ref-config";
import { toDocumentDto } from "./serialize";
import type { DocumentDto, DocumentRefType } from "./types";
import { resolveUploaderNames } from "./uploader-names";

export { DocumentParentError };

async function validateFolderForEntity(
  orgId: string,
  refType: DocumentRefType,
  refId: string,
  folderId: string | null | undefined,
): Promise<string | null> {
  if (!folderId) return null;
  const folder = await prisma.qcfDocumentFolder.findFirst({
    where: { id: folderId, orgId, deletedAt: null },
  });
  if (!folder) throw new FolderServiceError("Folder not found", 404);
  if (folder.refType !== refType || folder.refId !== refId) {
    throw new FolderServiceError("Folder does not belong to this record", 400);
  }
  return folderId;
}

export async function listEntityDocuments(
  user: SessionUser,
  refType: DocumentRefType,
  refId: string,
  folderId?: string | null,
): Promise<DocumentDto[]> {
  await assertDocumentParent(user, refType, refId);
  const resolvedFolderId =
    folderId === undefined ? undefined : await validateFolderForEntity(user.orgId, refType, refId, folderId);

  const rows = await prisma.qcfDocument.findMany({
    where: {
      orgId: user.orgId,
      refType,
      refId,
      deletedAt: null,
      ...(resolvedFolderId !== undefined ? { folderId: resolvedFolderId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const names = await resolveUploaderNames(
    user.orgId,
    rows.map((r) => r.uploadedBy),
  );
  return rows.map((r) => toDocumentDto(r, names.get(r.uploadedBy) ?? null));
}

export async function uploadEntityDocument(
  user: SessionUser,
  refType: DocumentRefType,
  refId: string,
  file: File,
  folderId?: string | null,
): Promise<DocumentDto> {
  await assertDocumentParent(user, refType, refId);
  const resolvedFolderId = await validateFolderForEntity(
    user.orgId,
    refType,
    refId,
    folderId ?? null,
  );
  const segment = resolveStorageSegment(resolvedFolderId, refId);
  const { storageKey, size, safeName } = await saveCrmUpload(segment, file);
  try {
    const row = await prisma.qcfDocument.create({
      data: {
        orgId: user.orgId,
        refType,
        refId,
        folderId: resolvedFolderId,
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

export async function deleteEntityDocument(
  user: SessionUser,
  refType: DocumentRefType,
  refId: string,
  attachmentId: string,
): Promise<void> {
  await assertDocumentParent(user, refType, refId);
  const doc = await prisma.qcfDocument.findFirst({
    where: {
      id: attachmentId,
      orgId: user.orgId,
      refType,
      refId,
      deletedAt: null,
    },
  });
  if (!doc) throw new DocumentParentError("Document not found");

  const canDelete = user.role === "Administrator" || doc.uploadedBy === user.userId;
  if (!canDelete) {
    const err = new DocumentParentError("Forbidden", 403);
    throw err;
  }

  await prisma.qcfDocument.update({
    where: { id: doc.id },
    data: { deletedAt: new Date() },
  });
  await deleteCrmUpload(doc.storageKey);
}

async function findEntityDocument(
  user: SessionUser,
  refType: DocumentRefType,
  refId: string,
  attachmentId: string,
) {
  await assertDocumentParent(user, refType, refId);
  const doc = await prisma.qcfDocument.findFirst({
    where: {
      id: attachmentId,
      orgId: user.orgId,
      refType,
      refId,
      deletedAt: null,
    },
  });
  if (!doc) throw new DocumentParentError("Document not found");
  return doc;
}

export async function getEntityDocumentDownloadUrl(
  user: SessionUser,
  refType: DocumentRefType,
  refId: string,
  attachmentId: string,
): Promise<{ redirectUrl: string; fileName: string; contentType: string }> {
  const doc = await findEntityDocument(user, refType, refId, attachmentId);
  const redirectUrl = await getCrmUploadDownloadUrl(doc.storageKey);
  return { redirectUrl, fileName: doc.fileName, contentType: doc.contentType };
}

export async function getEntityDocumentPreview(
  user: SessionUser,
  refType: DocumentRefType,
  refId: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  const doc = await findEntityDocument(user, refType, refId, attachmentId);
  const buffer = await readCrmUpload(doc.storageKey);
  return { buffer, fileName: doc.fileName, contentType: doc.contentType };
}
