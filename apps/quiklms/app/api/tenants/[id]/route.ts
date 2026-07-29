import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, assertOrgAccess } from '@/lib/auth/context';
import { findTenant, updateTenant, removeTenant } from '@/lib/services/tenants-service';
import { z } from 'zod';

// GET /api/tenants/:id — SUPER_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  // `params.id` IS an org id. The role check was the only gate, so a caller holding
  // the role could read, update or DELETE another org's tenant by editing the path.
  await assertOrgAccess(actor, params!.id);
  return json({ success: true, data: await findTenant(params!.id) });
});

/**
 * 1:1 port of `UpdateTenantDto` (`src/tenants/dto/update-tenant.dto.ts`).
 *
 * `.strict()` is REQUIRED here and is not a stylistic choice. `UpdateTenantDto`
 * is a genuine class-validator DTO, so the global
 * `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` really did
 * run on it and really did 400 on unknown keys. GAP_REPORT §3.1 names `tenants`
 * as one of the few modules where that regression is real.
 *
 * It is also a mass-assignment fix: this route previously used
 * `z.object({}).passthrough()` and forwarded every client key into a Prisma
 * write, so a caller could set `id`, `orgId`, `tenantKey`, `subdomain`, or
 * `storageLimit` — none of which are in the DTO.
 */
const updateSchema = z
  .object({
    name: z.string().optional(),
    // `status` is applied to the platform `quikit.Org`, not to a column on this
    // table — see lib/tenant-status. `Trial` was dropped from the accepted
    // values: it had no Org equivalent (a trial is `Subscription.status` +
    // `OrgAppAccess.trialEndsAt`, not an org state) and no tenant ever used it.
    status: z.enum(['Active', 'Paused']).optional(),
    tenantType: z.enum(['corporate', 'school']).optional(),
    // Organization profile
    orgName: z.string().optional(),
    fullAddress: z.string().optional(),
    country: z.string().optional(),
    officialPhone: z.string().optional(),
    website: z.string().optional(),
    officialEmail: z.string().email().optional(),
    // Primary contact
    contactFirstName: z.string().optional(),
    contactMiddleName: z.string().optional(),
    contactLastName: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactRoleInOrganization: z.string().optional(),
    // Billing
    billingFirstName: z.string().optional(),
    billingMiddleName: z.string().optional(),
    billingLastName: z.string().optional(),
    billingAddress: z.string().optional(),
    // Storage — @Min(1) @Max(1000)
    storageLimit: z.number().min(1).max(1000).optional(),
    // Feature config — merged, not replaced (see updateTenant)
    featureConfig: z.record(z.unknown()).optional(),
  })
  .strict();

// PATCH /api/tenants/:id — SUPER_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  // `params.id` IS an org id. The role check was the only gate, so a caller holding
  // the role could read, update or DELETE another org's tenant by editing the path.
  await assertOrgAccess(actor, params!.id);
  const dto = await parseBody(req, updateSchema);
  const tenant = await updateTenant(params!.id, dto);
  return json({ success: true, data: tenant, message: 'Tenant updated successfully' });
});

// DELETE /api/tenants/:id — SUPER_ADMIN
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  // `params.id` IS an org id. The role check was the only gate, so a caller holding
  // the role could read, update or DELETE another org's tenant by editing the path.
  await assertOrgAccess(actor, params!.id);
  await removeTenant(params!.id);
  return json({ success: true, message: 'Tenant deleted successfully' });
});
