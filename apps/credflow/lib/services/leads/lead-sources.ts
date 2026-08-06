import { prisma } from "@/lib/db/prisma";
import { DEFAULT_LEAD_SOURCES } from "@/lib/leads/lead-sources-defaults";

export { DEFAULT_LEAD_SOURCES, defaultLeadSourceOptions } from "@/lib/leads/lead-sources-defaults";
export type { DefaultLeadSource } from "@/lib/leads/lead-sources-defaults";

/**
 * Seeds default lead sources for a tenant the first time sources are requested
 * (same pattern as call dispositions and pipeline stage defaults).
 */
export async function ensureDefaultLeadSources(tenantId: string): Promise<void> {
  const count = await prisma.crmLeadSource.count({ where: { tenantId } });
  if (count > 0) return;

  await prisma.crmLeadSource.createMany({
    data: DEFAULT_LEAD_SOURCES.map((name) => ({
      tenantId,
      name,
      active: true,
    })),
    skipDuplicates: true,
  });
}
