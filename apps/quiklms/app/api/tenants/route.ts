import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createTenant, findAllTenants } from '@/lib/services/tenants-service';

// GET /api/tenants — SUPER_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  return json({ success: true, data: await findAllTenants() });
});

const createSchema = z.object({
  name: z.string().min(1),
  subdomain: z.string().min(1),
  tenantType: z.enum(['corporate', 'school']).optional(),
  tenantKey: z.string().min(1),
  orgName: z.string().min(1),
  fullAddress: z.string().min(1),
  country: z.string().min(1),
  officialPhone: z.string().min(1),
  officialEmail: z.string().email(),
  contactFirstName: z.string().min(1),
  contactLastName: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().email(),
  contactRoleInOrganization: z.string().min(1),
  billingFirstName: z.string().min(1),
  billingLastName: z.string().min(1),
  billingAddress: z.string().min(1),
}).passthrough();

// POST /api/tenants — SUPER_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const dto = await parseBody(req, createSchema);
  const tenant = await createTenant(dto as Parameters<typeof createTenant>[0]);
  const base = process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3020';
  return json({ success: true, data: tenant, message: 'Tenant created successfully', clientUrl: `${base}/${tenant.subdomain}` }, 201);
});
