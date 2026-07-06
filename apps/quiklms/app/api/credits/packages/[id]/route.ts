import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { updatePackageDefinition, deletePackageDefinition } from '@/lib/services/credits-service';

const schema = z.object({
  name: z.string().optional(),
  credits: z.number().min(1).optional(),
  price: z.number().min(0).optional(),
  validityMonths: z.number().min(1).optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/credits/packages/:id — TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await updatePackageDefinition(actor.tenantId!, params!.id, dto));
});

// DELETE /api/credits/packages/:id — TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await deletePackageDefinition(actor.tenantId!, params!.id));
});
