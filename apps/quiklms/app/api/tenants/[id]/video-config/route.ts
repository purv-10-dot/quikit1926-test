import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, assertTenantMatch } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { findTenant } from '@/lib/services/tenants-service';

/**
 * GET /api/tenants/:id/video-config — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Port of `TenantsController.getVideoConfig` (`tenants.controller.ts:375-380`).
 *
 * Returns provider credentials (apiKey / apiSecret / clientSecret / refreshToken
 * / jwtSecret) UNREDACTED. That is faithful — the original returned
 * `tenant.videoConfig` raw too. It is a reproduced flaw, not a migration
 * regression, so it is preserved rather than "fixed" here. Note the schema
 * comment on `LmsTenant.videoConfig` claims the column is "encrypted at rest
 * (lib/crypto)" — nothing encrypts or decrypts it on either side. See the
 * QUESTION in the migration summary.
 */
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  assertTenantMatch(actor, params!.id);

  const tenant = await findTenant(params!.id);
  return json({ success: true, data: tenant.videoConfig ?? {} });
});

/**
 * PATCH /api/tenants/:id/video-config — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Port of `TenantsController.updateVideoConfig` (`tenants.controller.ts:364-373`).
 *
 * MERGES into the existing config — `{ ...existing, ...body }`, exactly as the
 * original did. Mongo let the legacy code mutate one JSON field in place; Prisma
 * writes the whole column, so a naive `data: { videoConfig: dto }` DESTROYS every
 * key the request omitted. That is what this route used to do: `PATCH
 * {provider:'zoom'}` silently wiped the stored `credentials`.
 *
 * The merge is SHALLOW, matching the legacy spread — a nested object in the body
 * replaces its counterpart wholesale rather than merging key-by-key.
 *
 * `.passthrough()` is correct here: the legacy body was `@Body() body: any`, so
 * it had no runtime metatype and ValidationPipe never ran. Unknown keys were
 * accepted and stored. The write is scoped to the `videoConfig` column, so this
 * is not a mass-assignment vector — unlike `PATCH /tenants/:id`.
 */
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  assertTenantMatch(actor, params!.id);

  const existingTenant = await findTenant(params!.id);
  const dto = await parseBody(req, z.object({}).passthrough());

  const existing = (existingTenant.videoConfig ?? {}) as Record<string, unknown>;
  const updated = { ...existing, ...(dto as Record<string, unknown>) };

  const tenant = await prisma.lmsTenant.update({
    where: { id: params!.id },
    data: { videoConfig: updated as object },
  });
  // Message string is the legacy one verbatim (`tenants.controller.ts:372`).
  return json({ success: true, data: tenant.videoConfig ?? {}, message: 'Video config updated' });
});
