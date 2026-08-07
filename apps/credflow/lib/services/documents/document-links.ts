import { prisma } from "@/lib/db/prisma";
import {
  getDocumentLinkClient,
  isDocumentLinkTableMissingError,
  requireDocumentLinkClient,
} from "@/lib/db/document-link-client";
import type { SessionUser } from "@/types/permission";
import { assertDocumentParent } from "./ref-config";
import type { DocumentRefType } from "./types";
import { isDocumentRefType } from "./types";
import { FolderServiceError } from "@/lib/services/document-folders/scope";
import { toDocumentDto, toGlobalDocumentDownloadPath } from "./serialize";
import type { DocumentDto } from "./types";
import { resolveUploaderNames } from "./uploader-names";
import { enrichRelatedLabels } from "./enrich-related";

export interface CreateDocumentLinkInput {
  sourceDocumentId: string;
  targetFolderId?: string | null;
  refType?: string | null;
  refId?: string | null;
}

export interface DocumentLinkDto {
  id: string;
  sourceDocumentId: string;
  targetFolderId: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

function resolveDownloadUrl(doc: {
  id: string;
  refType: string;
  refId: string;
}): string {
  if (doc.refType === "global") {
    return toGlobalDocumentDownloadPath(doc.id);
  }
  if (isDocumentRefType(doc.refType)) {
    const segment: Record<DocumentRefType, string> = {
      lead: "leads",
      account: "accounts",
      opportunity: "opportunities",
      quote: "quotes",
      order: "orders",
    };
    return `/api/${segment[doc.refType]}/${doc.refId}/attachments/${doc.id}/download`;
  }
  return toGlobalDocumentDownloadPath(doc.id);
}

export function toLinkedDocumentDto(
  linkId: string,
  source: Parameters<typeof toDocumentDto>[0],
  uploadedByName: string | null,
  extra?: Pick<DocumentDto, "relatedLabel" | "relatedHref">,
): DocumentDto {
  const base = toDocumentDto(source, uploadedByName, extra);
  return {
    ...base,
    id: linkId,
    linkId,
    sourceDocumentId: source.id,
    isLink: true,
    downloadUrl: resolveDownloadUrl(source),
  };
}

export async function createDocumentLink(
  user: SessionUser,
  input: CreateDocumentLinkInput,
): Promise<DocumentLinkDto> {
  const source = await prisma.qcfDocument.findFirst({
    where: { id: input.sourceDocumentId, tenantId: user.tenantId, deletedAt: null },
  });
  if (!source) throw new FolderServiceError("Source document not found", 404);

  await assertDocumentParent(
    user,
    source.refType as DocumentRefType | "global",
    source.refId,
  );

  const targetFolderId = input.targetFolderId ?? null;
  const refType = input.refType ?? null;
  const refId = input.refId ?? null;

  if (targetFolderId) {
    const folder = await prisma.qcfDocumentFolder.findFirst({
      where: { id: targetFolderId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!folder) throw new FolderServiceError("Target folder not found", 404);
    if (folder.refType !== refType || folder.refId !== refId) {
      throw new FolderServiceError("Target folder scope mismatch", 400);
    }
  }

  if (
    source.folderId === targetFolderId &&
    source.refType === (refType ?? source.refType) &&
    source.refId === (refId ?? source.refId)
  ) {
    throw new FolderServiceError("File is already in this folder", 409);
  }

  const linkClient = requireDocumentLinkClient();
  const existing = await linkClient.findFirst({
    where: {
      tenantId: user.tenantId,
      sourceDocumentId: source.id,
      targetFolderId,
      refType,
      refId,
      deletedAt: null,
    },
  });
  if (existing) throw new FolderServiceError("File is already linked here", 409);

  if (refType && refId && isDocumentRefType(refType)) {
    await assertDocumentParent(user, refType, refId);
  } else if (refType === "global" || source.refType === "global") {
    await assertDocumentParent(user, "global", refId ?? user.tenantId);
  }

  let row;
  try {
    row = await linkClient.create({
      data: {
        tenantId: user.tenantId,
        sourceDocumentId: source.id,
        targetFolderId,
        refType,
        refId,
        createdBy: user.userId,
      },
    });
  } catch (error: unknown) {
    if (isDocumentLinkTableMissingError(error)) {
      throw new FolderServiceError(
        "Document links table is not migrated. Run npm run db:migrate:crm-document-links or scripts/apply-crm-document-links.sql",
        503,
      );
    }
    throw error;
  }

  return {
    id: row.id,
    sourceDocumentId: row.sourceDocumentId,
    targetFolderId: row.targetFolderId,
    refType: row.refType,
    refId: row.refId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteDocumentLink(user: SessionUser, linkId: string): Promise<void> {
  const linkClient = requireDocumentLinkClient();
  const link = await linkClient.findFirst({
    where: { id: linkId, tenantId: user.tenantId, deletedAt: null },
  });
  if (!link) throw new FolderServiceError("Link not found", 404);

  if (link.refType && link.refId && isDocumentRefType(link.refType)) {
    await assertDocumentParent(user, link.refType, link.refId);
  }

  await linkClient.update({
    where: { id: link.id },
    data: { deletedAt: new Date() },
  });
}

export async function listLinkedDocumentsForFolder(
  user: SessionUser,
  opts: {
    targetFolderId: string | null;
    refType: string | null;
    refId: string | null;
    q?: string;
  },
): Promise<DocumentDto[]> {
  const linkClient = getDocumentLinkClient();
  if (!linkClient) return [];

  let links;
  try {
    links = await linkClient.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        targetFolderId: opts.targetFolderId,
        refType: opts.refType,
        refId: opts.refId,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error: unknown) {
    if (isDocumentLinkTableMissingError(error)) return [];
    throw error;
  }
  if (links.length === 0) return [];

  const sources = await prisma.qcfDocument.findMany({
    where: {
      id: { in: links.map((l) => l.sourceDocumentId) },
      tenantId: user.tenantId,
      deletedAt: null,
    },
  });
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  const names = await resolveUploaderNames(
    user.tenantId,
    sources.map((s) => s.uploadedBy),
  );

  let dtos = links
    .map((link) => {
      const source = sourceMap.get(link.sourceDocumentId);
      if (!source) return null;
      if (opts.q?.trim() && !source.fileName.toLowerCase().includes(opts.q.trim().toLowerCase())) {
        return null;
      }
      return toLinkedDocumentDto(link.id, source, names.get(source.uploadedBy) ?? null);
    })
    .filter((d): d is DocumentDto => d !== null);

  dtos = await enrichRelatedLabels(user.tenantId, dtos);
  return dtos;
}
