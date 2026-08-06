import { prisma } from "@/lib/db/prisma";
import type { BreadcrumbItem } from "./types";
import { FolderServiceError } from "./scope";

const ROOT_CRUMB: BreadcrumbItem = { id: null, name: "Documents" };

type FolderBreadcrumbRow = {
  id: string;
  name: string;
  parentFolderId: string | null;
};

export async function buildFolderBreadcrumbs(
  tenantId: string,
  folderId: string | null,
): Promise<BreadcrumbItem[]> {
  if (!folderId) return [ROOT_CRUMB];

  const crumbs: BreadcrumbItem[] = [];
  let currentId: string | null = folderId;
  const seen = new Set<string>();

  while (currentId) {
    if (seen.has(currentId)) {
      throw new FolderServiceError("Folder hierarchy cycle detected", 500);
    }
    seen.add(currentId);

    const row: FolderBreadcrumbRow | null = await prisma.crmDocumentFolder.findFirst({
      where: { id: currentId, tenantId, deletedAt: null },
      select: { id: true, name: true, parentFolderId: true },
    });
    if (!row) break;
    crumbs.unshift({ id: row.id, name: row.name, navKey: row.id });
    currentId = row.parentFolderId;
  }

  return [ROOT_CRUMB, ...crumbs];
}
