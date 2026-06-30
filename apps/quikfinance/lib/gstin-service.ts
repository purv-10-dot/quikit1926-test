import { z } from "zod";

export const gstinSchema = z.object({
  gstin: z.string().trim().min(1).max(20),
  registration_type: z.enum(["registered_regular", "registered_composition", "isd"]).default("registered_regular"),
  legal_name: z.string().trim().max(200).optional().nullable(),
  trade_name: z.string().trim().max(200).optional().nullable(),
  registered_on: z.string().trim().max(10).optional().nullable(),
  reverse_charge: z.boolean().default(false),
  sez: z.boolean().default(false),
  digital_services: z.boolean().default(false),
  location_ids: z.array(z.string().uuid()).default([])
});

type RawClient = { $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown> };

/** Re-point the GSTIN's associated locations: clear current, attach the selected. */
export async function associateLocations(prisma: RawClient, orgId: string, gstinId: string, locationIds: string[]) {
  await prisma.$executeRaw`UPDATE warehouses SET gstin_id = NULL WHERE gstin_id = ${gstinId}::uuid AND org_id = ${orgId}::uuid`;
  for (const id of locationIds) {
    await prisma.$executeRaw`UPDATE warehouses SET gstin_id = ${gstinId}::uuid WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid`;
  }
}
