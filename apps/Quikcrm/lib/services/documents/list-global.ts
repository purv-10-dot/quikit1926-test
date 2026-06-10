import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { enrichRelatedLabels } from "./enrich-related";
import { toDocumentDto, toGlobalDocumentDownloadPath } from "./serialize";
import type { DocumentDto, DocumentRefType } from "./types";
import { isDocumentRefType } from "./types";
import { resolveUploaderNames } from "./uploader-names";

export interface GlobalDocumentsQuery {
  page: number;
  pageSize: number;
  q?: string;
  refType?: DocumentRefType;
  folderId?: string | null;
  sortBy: "createdAt" | "fileName" | "size";
  sortDir: "asc" | "desc";
}

export interface GlobalDocumentsResult {
  items: DocumentDto[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listGlobalDocuments(
  user: SessionUser,
  query: GlobalDocumentsQuery,
): Promise<GlobalDocumentsResult> {
  const where: Prisma.CrmDocumentWhereInput = {
    orgId: user.orgId,
    deletedAt: null,
  };

  if (query.refType) where.refType = query.refType;
  if (query.folderId !== undefined) where.folderId = query.folderId;
  if (query.q?.trim()) {
    where.fileName = { contains: query.q.trim(), mode: "insensitive" };
  }

  const orderBy: Prisma.CrmDocumentOrderByWithRelationInput = {
    [query.sortBy]: query.sortDir,
  };

  const skip = (query.page - 1) * query.pageSize;

  const [rows, total] = await Promise.all([
    prisma.crmDocument.findMany({
      where,
      orderBy,
      skip,
      take: query.pageSize,
    }),
    prisma.crmDocument.count({ where }),
  ]);

  const names = await resolveUploaderNames(
    user.orgId,
    rows.map((r) => r.uploadedBy),
  );

  const base = rows.map((r) => {
    const dto = toDocumentDto(r, names.get(r.uploadedBy) ?? null);
    return { ...dto, downloadUrl: toGlobalDocumentDownloadPath(r.id) };
  });
  const items = await enrichRelatedLabels(user.orgId, base);

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function parseGlobalDocumentsQuery(
  searchParams: URLSearchParams,
): GlobalDocumentsQuery | { error: string } {
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get("pageSize") ?? "25") || 25),
  );
  const q = searchParams.get("q")?.trim() || undefined;
  const refTypeRaw = searchParams.get("refType")?.trim();
  const refType =
    refTypeRaw && isDocumentRefType(refTypeRaw) ? refTypeRaw : undefined;
  if (refTypeRaw && !refType) {
    return { error: "Invalid refType" };
  }

  const sortByRaw = searchParams.get("sortBy") ?? "createdAt";
  const sortBy =
    sortByRaw === "fileName" || sortByRaw === "size" ? sortByRaw : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const folderIdRaw = searchParams.get("folderId");
  let folderId: string | null | undefined;
  if (folderIdRaw === "null" || folderIdRaw === "") {
    folderId = null;
  } else if (folderIdRaw) {
    folderId = folderIdRaw;
  }

  return { page, pageSize, q, refType, folderId, sortBy, sortDir };
}
