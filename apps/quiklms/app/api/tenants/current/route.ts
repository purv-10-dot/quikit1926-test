import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { findTenant } from '@/lib/services/tenants-service';

// GET /api/tenants/current — current tenant info for the authed user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);

  // SUPER_ADMIN has no tenant — return platform-level defaults
  if (!actor.tenantId) {
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

  const tenant = await findTenant(actor.tenantId);
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
