import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, assertTenantMatch } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { findTenant } from '@/lib/services/tenants-service';

// GET /api/tenants/:id/video-config — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  assertTenantMatch(actor, params!.id);

  const tenant = await findTenant(params!.id);
  return json({ success: true, data: tenant.videoConfig ?? {} });
});

// PATCH /api/tenants/:id/video-config — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  assertTenantMatch(actor, params!.id);

  await findTenant(params!.id);
  const dto = await parseBody(req, z.object({}).passthrough());

  const tenant = await prisma.tenant.update({
    where: { id: params!.id },
    data: { videoConfig: dto as object },
  });
  return json({ success: true, data: tenant.videoConfig ?? {}, message: 'Video configuration updated successfully' });
});
