import { prisma } from "@/lib/prisma";
import { DEFAULT_CANDIDATE_DOC_TYPES } from "@/lib/data/candidate-doc-defaults";

/**
 * Ensures default candidate document types exist for the tenant.
 * Idempotent — only creates missing ones, never overwrites HR edits.
 */
export async function ensureCandidateDocDefaults(orgId: string, userId?: string | null): Promise<number> {
  const existing = await prisma.candidateDocumentType.findMany({
    where: { orgId, deletedAt: null },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((e) => e.code));
  const toCreate = DEFAULT_CANDIDATE_DOC_TYPES.filter((d) => !existingCodes.has(d.code));
  if (!toCreate.length) return 0;

  await prisma.candidateDocumentType.createMany({
    data: toCreate.map((d) => ({
      orgId,
      name: d.name,
      code: d.code,
      isRequired: d.isRequired,
      isDefault: true,
      isActive: true,
      sortOrder: d.sortOrder,
      helpText: d.helpText ?? null,
      createdBy: userId ?? null,
    })),
    skipDuplicates: true,
  });
  return toCreate.length;
}
