import { route, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

function hostSubdomain(host: string | null): string | null {
  if (!host) return null;
  const parts = host.split(':')[0].split('.');
  if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== '') return parts[0];
  return null;
}

/**
 * GET /api/tenants/branding/public — PUBLIC. Branding for the current tenant,
 * resolved (in priority order) from:
 *   1. x-tenant-key header
 *   2. x-tenant-subdomain header (set by middleware for subdomain requests)
 *   3. ?subdomain= query param (explicit override)
 *   4. Host header subdomain (fallback for direct API calls)
 */
export const GET = route(async (req) => {
  const url = new URL(req.url);
  const tenantKey = req.headers.get('x-tenant-key');
  const subdomain =
    req.headers.get('x-tenant-subdomain') ||
    url.searchParams.get('subdomain') ||
    hostSubdomain(req.headers.get('host'));

  let tenant = null;
  if (tenantKey) tenant = await prisma.lmsTenant.findUnique({ where: { tenantKey } });
  else if (subdomain) tenant = await prisma.lmsTenant.findUnique({ where: { subdomain } });

  if (!tenant) return json({ success: true, data: null });
  return json({
    success: true,
    data: { logo: tenant.logoUrl || null, primaryColor: tenant.primaryColor || null, secondaryColor: tenant.secondaryColor || null },
  });
});
