import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { onboardTenant, type OnboardInput } from '@/lib/services/tenants-service';

const schema = z.object({
  tenantType: z.enum(['corporate', 'school']).default('corporate'),
  orgName: z.string().min(2),
  fullAddress: z.string().min(5),
  country: z.string().min(1),
  officialPhone: z.string(),
  website: z.string().optional(),
  officialEmail: z.string().email(),
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  lastName: z.string().min(1),
  phone: z.string(),
  email: z.string().email(),
  roleInOrganization: z.string().min(1),
  billingFirstName: z.string().min(1),
  billingMiddleName: z.string().optional(),
  billingLastName: z.string().min(1),
  billingAddress: z.string().min(5),
  storageLimit: z.union([z.number(), z.string()]).optional().transform((v) => {
    if (v === undefined) return 2;
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return isNaN(n) ? 2 : n;
  }),
});

// POST /api/tenants/onboard — SUPER_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const dto = await parseBody(req, schema);
  // Actor comes from the session, never the body — it is an audit field.
  const tenant = await onboardTenant({ ...dto, createdByUserId: actor.id } as OnboardInput);
  return json({ success: true, data: tenant, message: 'Tenant onboarded successfully. Welcome kit email sent.' }, 201);
});
