import { prisma } from "@/lib/db/prisma";
import { FolderServiceError, scopesMatch } from "./scope";

type FolderParentRow = { parentFolderId: string | null };

/** Returns true if `descendantId` is under `ancestorId` in the folder tree. */
export async function isFolderDescendant(
  orgId: string,
  ancestorId: string,
  descendantId: string,
): Promise<boolean> {
  let currentId: string | null = descendantId;
  const seen = new Set<string>();

  while (currentId) {
    if (currentId === ancestorId) return true;
    if (seen.has(currentId)) return false;
    seen.add(currentId);

    const row: FolderParentRow | null = await prisma.crmDocumentFolder.findFirst({
      where: { id: currentId, orgId, deletedAt: null },
      select: { parentFolderId: true },
    });
    if (!row) return false;
    currentId = row.parentFolderId;
  }
  return false;
}

export async function validateFolderMove(
  orgId: string,
  folderId: string,
  newParentFolderId: string | null,
): Promise<void> {
  if (newParentFolderId === folderId) {
    throw new FolderServiceError("Cannot move a folder into itself");
  }

  const folder = await prisma.crmDocumentFolder.findFirst({
    where: { id: folderId, orgId, deletedAt: null },
  });
  if (!folder) throw new FolderServiceError("Folder not found", 404);

  if (!newParentFolderId) return;

  const parent = await prisma.crmDocumentFolder.findFirst({
    where: { id: newParentFolderId, orgId, deletedAt: null },
  });
  if (!parent) throw new FolderServiceError("Parent folder not found", 404);

  if (!scopesMatch(folder, parent)) {
    throw new FolderServiceError("Parent folder must be in the same scope");
  }

  if (await isFolderDescendant(orgId, folderId, newParentFolderId)) {
    throw new FolderServiceError("Cannot move a folder into its own descendant");
  }
}
