import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, assertTenantMatch } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { findTenant } from '@/lib/services/tenants-service';

const schema = z.object({
  logoUrl: z.string().nullable().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
});

// PATCH /api/tenants/:id/branding — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  assertTenantMatch(actor, params!.id);

  await findTenant(params!.id);
  const dto = await parseBody(req, schema);

  const data: Record<string, unknown> = {};
  if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
  if (dto.primaryColor !== undefined) data.primaryColor = dto.primaryColor;
  if (dto.secondaryColor !== undefined) data.secondaryColor = dto.secondaryColor;

  const tenant = await prisma.lmsTenant.update({ where: { id: params!.id }, data });
  return json({ success: true, data: tenant, message: 'Branding updated successfully' });
});
