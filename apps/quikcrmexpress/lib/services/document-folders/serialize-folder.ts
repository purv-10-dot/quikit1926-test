import type { FolderDto } from "./types";

export interface FolderRow {
  id: string;
  orgId: string;
  name: string;
  parentFolderId: string | null;
  refType: string | null;
  refId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toFolderDto(
  row: FolderRow,
  counts?: { childFolderCount?: number; fileCount?: number },
): FolderDto {
  return {
    id: row.id,
    name: row.name,
    parentFolderId: row.parentFolderId,
    refType: (row.refType as FolderDto["refType"]) ?? null,
    refId: row.refId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...counts,
  };
}
