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
    dbConnectionString: z.string().optional(),
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

// POST /api/tenants — SUPER_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const dto = await parseBody(req, createSchema);
  const tenant = await createTenant(dto);
  // Legacy fallback host (`tenants.controller.ts:98`) — NOT localhost. The old
  // default here was 'http://localhost:3020', so a production deploy missing both
  // BASE_URL and FRONTEND_URL handed every new tenant a localhost clientUrl.
  const base = process.env.BASE_URL || process.env.FRONTEND_URL || 'https://quikskills.quikit.ai';
  return json({ success: true, data: tenant, message: 'Tenant created successfully', clientUrl: `${base}/${tenant.subdomain}` }, 201);
});
