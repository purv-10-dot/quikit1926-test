import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getPackageDefinitions, createPackageDefinition } from '@/lib/services/credits-service';

const schema = z.object({
  name: z.string(),
  credits: z.number().min(1),
  price: z.number().min(0),
  validityMonths: z.number().min(1),
  isActive: z.boolean().optional(),
});

// GET /api/credits/packages — any authed user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  return json(await getPackageDefinitions(actor.tenantId!));
});

// POST /api/credits/packages — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await createPackageDefinition(actor.tenantId!, dto));
});
