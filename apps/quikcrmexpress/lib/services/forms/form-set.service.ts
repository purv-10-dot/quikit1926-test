/**
 * FR-RE Slice 0 — form-set creation + listing (the admin form-builder entry).
 *
 * createFormSet provisions a complete starting point: the set (default for its
 * surface), its first DRAFT version, and the protected Call Disposition tab with
 * its 4 protected fields (via seedProtectedDispositionTab from Unit 2).
 */
import { prisma } from "@/lib/db/prisma";
import type { QceFormSet, QceFormSetVersion } from "@quikit/database";
import { seedProtectedDispositionTab } from "@/lib/services/forms/form-structure.service";

/** Create a call_disposition form set + its v1 draft + the protected tab/fields. */
export async function createFormSet(input: {
  orgId: string;
  name: string;
  createdByUserId?: string | null;
}): Promise<{ set: QceFormSet; version: QceFormSetVersion }> {
  const set = await prisma.qceFormSet.create({
    data: {
      orgId: input.orgId,
      surface: "call_disposition",
      name: input.name,
      isDefault: true, // demo: one set per surface; multi-set default mgmt deferred
    },
  });

  const version = await prisma.qceFormSetVersion.create({
    data: { formSetId: set.id, versionNumber: 1, status: "draft" },
  });

  await seedProtectedDispositionTab(version.id, input.createdByUserId ?? null);

  return { set, version };
}

/** A tenant's call_disposition form sets, with their versions (draft/published). */
export async function listFormSets(orgId: string) {
  return prisma.qceFormSet.findMany({
    where: { orgId, surface: "call_disposition" },
    orderBy: { createdAt: "asc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        select: { id: true, versionNumber: true, status: true, publishedAt: true },
      },
    },
  });
}
