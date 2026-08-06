import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { findTenant } from '@/lib/services/tenants-service';

// GET /api/tenants/current — current tenant info for the authed user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);

  // The platform OPERATOR's org has no Tenant row (schools/corporates are separate
  // orgs it onboards). Return platform-level defaults rather than 404ing on
  // findTenant. Also covers a platform super-admin with no org.
  //
  // Keyed on the `isSuperAdmin` claim, not the role: an org's founding admin now
  // resolves to an LMS role of SUPER_ADMIN (lib/auth/founding-admin.ts) but has a
  // real tenant, and the role test served them the "QuikSkill Platform" placeholder
  // instead of their own org's name, branding and localization.
  if (actor.isSuperAdmin === true || !actor.orgId) {
    return json({
      success: true,
      data: {
        id: null,
        name: 'QuikSkill',
        tenantType: null,
        orgName: 'QuikSkill Platform',
        status: 'ACTIVE',
        branding: { logo: null, primaryColor: '#3B82F6', secondaryColor: '#1E40AF' },
        localization: { timezone: 'UTC', defaultLanguage: 'en', enabledLanguages: ['en'], locale: 'en', currency: 'USD' },
      },
    });
  }

  const tenant = await findTenant(actor.orgId);
  return json({
    success: true,
    data: {
      id: tenant.id,
      name: tenant.name,
      tenantType: tenant.tenantType,
      orgName: tenant.orgName,
      status: tenant.status,
      branding: { logo: tenant.logoUrl, primaryColor: tenant.primaryColor, secondaryColor: tenant.secondaryColor },
      localization: {
        timezone: tenant.timezone,
        defaultLanguage: tenant.defaultLanguage,
        enabledLanguages: tenant.enabledLanguages,
        locale: tenant.locale,
        currency: tenant.currency,
      },
    },
  });
});
