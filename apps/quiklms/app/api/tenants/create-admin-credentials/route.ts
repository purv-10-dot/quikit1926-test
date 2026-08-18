import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, assertOrgAccess, isPlatformOperator } from '@/lib/auth/context';
import {
  createTenantAdminForTenant,
  createTenantAdminsForAllTenants,
} from '@/lib/services/tenants-service';

/**
 * Legacy body was an inline TS interface (`tenants.controller.ts:427`) — no
 * runtime metatype, so ValidationPipe never ran and the endpoint had no
 * validation. Non-strict (strip) to stay closest to that.
 */
const schema = z.object({ tenantId: z.string().optional() });

/**
 * POST /api/tenants/create-admin-credentials — ADMIN
 *
 * Port of `TenantsController.createAdminCredentials` (`tenants.controller.ts:424-446`).
 * Previously had no route file, so bulk tenant-admin provisioning was lost.
 *
 * With `tenantId` → provision that tenant's admin. Without → provision for every
 * tenant, collecting per-tenant failures rather than aborting.
 *
 * 200, not 201: the legacy handler carried an explicit
 * `@HttpCode(HttpStatus.OK)` override (`:426`), unlike the other @Post()s in this
 * controller.
 *
 * NOTE — this returns admin passwords in plaintext, as the original did. The
 * password is now a per-admin temp password from the centralized auth helper
 * rather than the legacy's shared hardcoded 'TenantAdmin@123'. See the QUESTION
 * in the migration summary about closing this channel entirely.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  const { tenantId } = await parseBody(req, schema);

  // The sharpest edge on the console: this MINTS admin credentials and returns the
  // passwords in plaintext, and an absent `tenantId` did it for EVERY tenant. Behind a
  // role-only check, any holder of ADMIN — including an org's founding admin —
  // could POST an empty body and walk away with admin passwords for the whole platform.
  //
  // Scoped rather than denied, for the reason in lib/auth/context.ts `orgScope`: a
  // non-operator is pinned to their OWN org and can never reach the all-tenants branch.
  // The operator's behaviour is unchanged.
  assertOrgAccess(actor, tenantId);
  const target = isPlatformOperator(actor) ? tenantId : tenantId ?? actor.orgId ?? undefined;

  if (target) {
    const data = await createTenantAdminForTenant(target);
    return json({ success: true, data, message: 'Tenant admin credentials created successfully' });
  }

  const data = await createTenantAdminsForAllTenants();
  return json({ success: true, data, message: 'Tenant admin credentials created for all tenants' });
});
