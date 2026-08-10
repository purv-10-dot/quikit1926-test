import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { FolderServiceError } from "@/lib/services/document-folders/scope";

export type DocumentLinkDelegate = NonNullable<(typeof prisma)["crmDocumentLink"]>;

let warnedMissingDelegate = false;
let warnedMissingTable = false;

function warnDelegateMissing(): void {
  if (warnedMissingDelegate) return;
  warnedMissingDelegate = true;
  console.warn(
    "[quikcrm] prisma.crmDocumentLink delegate missing. From repo root: npm run db:generate — then restart the dev server.",
  );
}

/** Undefined when Prisma client was generated before CrmDocumentLink or dev server is stale. */
export function getDocumentLinkClient(): DocumentLinkDelegate | undefined {
  const client = (prisma as { crmDocumentLink?: DocumentLinkDelegate }).crmDocumentLink;
  if (!client) warnDelegateMissing();
  return client;
}

export function requireDocumentLinkClient(): DocumentLinkDelegate {
  const client = getDocumentLinkClient();
  if (!client) {
    throw new FolderServiceError(
      "Document links are unavailable. Run npm run db:generate from the repo root, then restart the dev server.",
      503,
    );
  }
  return client;
}

export function isDocumentLinkTableMissingError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2021") return false;
  const table = String(error.meta?.table ?? "");
  return table.includes("CrmDocumentLink");
}

function warnMissingTable(): void {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  console.warn(
    "[quikcrm] app_quikcrm.CrmDocumentLink table missing. Apply migration: npm run db:migrate:crm-document-links — or run scripts/apply-crm-document-links.sql",
  );
}

export interface DocumentLinkExclusionWhere {
  tenantId: string;
  targetFolderId: string | null;
  refType: string | null;
  refId: string | null;
}

/** Safe for picker / folder list — never throws when table or delegate is missing. */
export async function findLinkedSourceIdsForExclusion(
  where: DocumentLinkExclusionWhere,
): Promise<string[]> {
  const linkClient = getDocumentLinkClient();
  if (!linkClient) return [];

  try {
    const rows = await linkClient.findMany({
      where: {
        tenantId: where.tenantId,
        deletedAt: null,
        targetFolderId: where.targetFolderId,
        refType: where.refType,
        refId: where.refId,
      },
      select: { sourceDocumentId: true },
    });
    return rows.map((r) => r.sourceDocumentId);
  } catch (error: unknown) {
    if (isDocumentLinkTableMissingError(error)) {
      warnMissingTable();
      return [];
    }
    throw error;
  }
}
