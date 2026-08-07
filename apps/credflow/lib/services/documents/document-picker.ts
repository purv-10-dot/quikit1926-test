import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { assertDocumentParent } from "./ref-config";
import type { DocumentRefType } from "./types";
import { isDocumentRefType } from "./types";
import { enrichRelatedLabels } from "./enrich-related";
import { toDocumentDto, toGlobalDocumentDownloadPath } from "./serialize";
import type { DocumentDto } from "./types";
import { resolveUploaderNames } from "./uploader-names";
import { decodeLocation, type ExplorerLocation } from "@/lib/services/document-folders/explorer-location";
import { FolderServiceError } from "@/lib/services/document-folders/scope";
import { findLinkedSourceIdsForExclusion } from "@/lib/db/document-link-client";

export interface DocumentPickerQuery {
  location?: string;
  q?: string;
  refType?: DocumentRefType;
  recent?: boolean;
  page?: number;
  pageSize?: number;
  /** Exclude files already linked natively or via link in this target */
  excludeTargetFolderId?: string | null;
  excludeRefType?: string | null;
  excludeRefId?: string | null;
}

export interface DocumentPickerResult {
  items: DocumentDto[];
  total: number;
  page: number;
  pageSize: number;
  location: ExplorerLocation;
}

async function filterAccessible(
  user: SessionUser,
  rows: {
    id: string;
    refType: string;
    refId: string;
    folderId: string | null;
    fileName: string;
    contentType: string;
    size: number;
    storageKey: string;
    uploadedBy: string;
    createdAt: Date;
  }[],
): Promise<typeof rows> {
  const out: typeof rows = [];
  for (const row of rows) {
    try {
      await assertDocumentParent(
        user,
        row.refType as DocumentRefType | "global",
        row.refId,
      );
      out.push(row);
    } catch {
      /* skip inaccessible */
    }
  }
  return out;
}

export async function listDocumentPickerFiles(
  user: SessionUser,
  query: DocumentPickerQuery,
): Promise<DocumentPickerResult> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 25));
  const location = decodeLocation(query.location ?? "root");

  const where: {
    tenantId: string;
    deletedAt: null;
    fileName?: { contains: string; mode: "insensitive" };
    refType?: string;
  } = {
    tenantId: user.tenantId,
    deletedAt: null,
  };

  if (query.q?.trim()) {
    where.fileName = { contains: query.q.trim(), mode: "insensitive" };
  }
  if (query.refType) {
    where.refType = query.refType;
  }

  if (location.kind === "entity") {
    where.refType = location.refType;
  }

  if (location.kind === "folder") {
    const folder = await prisma.qcfDocumentFolder.findFirst({
      where: { id: location.folderId, tenantId: user.tenantId, deletedAt: null },
    });
    if (folder?.refType) {
      where.refType = folder.refType;
    }
  }

  const orderBy = query.recent
    ? ({ createdAt: "desc" } as const)
    : ({ fileName: "asc" } as const);

  const take = query.recent ? Math.min(pageSize, 20) : pageSize * 3;
  const rows = await prisma.qcfDocument.findMany({
    where,
    orderBy,
    take: query.recent ? take : take,
    skip: query.recent ? (page - 1) * pageSize : (page - 1) * pageSize,
  });

  let accessible = await filterAccessible(user, rows);

  if (location.kind === "folder") {
    const folder = await prisma.qcfDocumentFolder.findFirst({
      where: { id: location.folderId, tenantId: user.tenantId, deletedAt: null },
    });
    if (folder) {
      accessible = accessible.filter(
        (r) =>
          !(
            r.folderId === folder.id &&
            r.refType === (folder.refType ?? r.refType) &&
            r.refId === (folder.refId ?? r.refId)
          ),
      );
    }
  }

  if (query.excludeRefType != null || query.excludeTargetFolderId !== undefined) {
    const linkedIds = await findLinkedSourceIdsForExclusion({
      tenantId: user.tenantId,
      targetFolderId: query.excludeTargetFolderId ?? null,
      refType: query.excludeRefType ?? null,
      refId: query.excludeRefId ?? null,
    });
    const linkedSet = new Set(linkedIds);
    accessible = accessible.filter((r) => {
      if (
        r.folderId === (query.excludeTargetFolderId ?? null) &&
        r.refType === (query.excludeRefType ?? r.refType) &&
        r.refId === (query.excludeRefId ?? r.refId)
      ) {
        return false;
      }
      if (linkedSet.has(r.id)) return false;
      return true;
    });
  }

  const total = accessible.length;
  const pageSlice = accessible.slice(0, pageSize);

  const names = await resolveUploaderNames(
    user.tenantId,
    pageSlice.map((r) => r.uploadedBy),
  );

  let items = pageSlice.map((r) => {
    const dto = toDocumentDto(r, names.get(r.uploadedBy) ?? null);
    if (r.refType === "global") {
      return { ...dto, downloadUrl: toGlobalDocumentDownloadPath(r.id) };
    }
    return { ...dto, sourceDocumentId: r.id, isLink: false };
  });

  items = await enrichRelatedLabels(user.tenantId, items);

  return { items, total, page, pageSize, location };
}
