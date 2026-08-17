import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, visibleOrgIds } from '@/lib/auth/context';
import { createTenant, findAllTenants } from '@/lib/services/tenants-service';

// GET /api/tenants — ADMIN. Scoped to the orgs this caller may see: their own
// plus every org they onboarded (see lib/auth/context.ts `visibleOrgIds`). The platform
// operator gets all of them.
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  return json({ success: true, data: await findAllTenants(await visibleOrgIds(actor)) });
});

/** GST format from `CreateTenantDto` (`create-tenant.dto.ts`) — copied verbatim. */
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * `CreateTenantDto` (`create-tenant.dto.ts`) + the columns the tenant schema
 * marks non-nullable.
 *
 * Why the superset: the legacy `POST /tenants` was UNREACHABLE. Its DTO carried
 * only {name, gstNumber, dbConnectionString?, tenantType?}, but the Mongoose
 * schema required 13 more fields (`tenant.schema.ts:197-247`), so a
 * DTO-conformant body always died on `save()` with a ValidationError → 500, and
 * a complete body tripped `forbidNonWhitelisted` → 400. Prisma reproduced that
 * required set faithfully, so the fields stay. See the QUESTION in the summary.
 *
 * What actually changed here:
 *   - `gstNumber` + its format regex were missing entirely → restored.
 *   - `subdomain` / `tenantKey` were REQUIRED FROM THE CLIENT → now generated
 *     server-side, as the legacy service did.
 *   - `.passthrough()` → `.strict()`: `CreateTenantDto` is a genuine
 *     class-validator DTO, so `forbidNonWhitelisted` really did 400 unknown keys
 *     here, and passthrough fed them straight into a Prisma create.
 */
const createSchema = z
  .object({
    // CreateTenantDto
    name: z.string().min(1),
    gstNumber: z.string().min(1).regex(GST_REGEX, 'Invalid GST Number format'),
    // `dbConnectionString` was removed. It was a leftover from the per-tenant
    // database design the platform fold retired — every tenant now lives in the
    // one shared multiSchema database — and it accepted a connection string
    // (a credential) into a plain column. No row ever held a value.
    tenantType: z.enum(['corporate', 'school']).optional(),
    // Schema-required
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
    // Schema-optional
    website: z.string().optional(),
    contactMiddleName: z.string().optional(),
    billingMiddleName: z.string().optional(),
  })
  .strict();

// POST /api/tenants — ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  const dto = await parseBody(req, createSchema);
  const tenant = await createTenant(dto);
  // App's own public origin. NEXTAUTH_URL is the platform-standard self-origin
  // var and is ALWAYS set in prod (NextAuth cannot boot without it), so the
  // localhost fallback only ever applies in local dev — a prod deploy can never
  // hand a tenant a localhost clientUrl.
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3014';
  return json({ success: true, data: tenant, message: 'Tenant created successfully', clientUrl: `${base}/${tenant.subdomain}` }, 201);
});
