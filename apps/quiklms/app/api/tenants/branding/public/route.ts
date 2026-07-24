import { route, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { presignFromUrlOrKey, isManagedStorageUrl } from '@/lib/s3';

function hostSubdomain(host: string | null): string | null {
  if (!host) return null;
  const parts = host.split(':')[0].split('.');
  if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== '') return parts[0];
  return null;
}

/**
 * GET /api/tenants/branding/public — PUBLIC.
 *
 * Port of `TenantsController.getPublicBranding` (`tenants.controller.ts:64-88`),
 * which resolved the tenant from `req.tenantId` — set by the tenant-resolver
 * middleware off the request's host/key. The tenant is therefore derived from
 * WHERE THE REQUEST CAME FROM, never from caller-supplied content:
 *   1. x-tenant-key header
 *   2. x-tenant-subdomain header (set by middleware for subdomain requests)
 *   3. Host header subdomain (fallback for direct API calls)
 *
 * The `?subdomain=` query override this route used to accept has been REMOVED. It
 * had no counterpart in the original and, on an unauthenticated endpoint, let any
 * caller enumerate every tenant's branding by guessing subdomains — it broke the
 * host-binding that made this endpoint safe to expose publicly.
 *
 * Errors are swallowed into `{success:true, data:null}`, matching the legacy
 * try/catch — this endpoint never fails loudly.
 */
export const GET = route(async (req) => {
  const tenantKey = req.headers.get('x-tenant-key');
  const subdomain = req.headers.get('x-tenant-subdomain') || hostSubdomain(req.headers.get('host'));

  try {
    let tenant = null;
    if (tenantKey) tenant = await prisma.lmsTenant.findUnique({ where: { tenantKey } });
    else if (subdomain) tenant = await prisma.lmsTenant.findUnique({ where: { subdomain } });

    if (!tenant) return json({ success: true, data: null });

    // Legacy presigned the logo only when it was an S3 URL, passing anything else
    // through untouched (`tenants.controller.ts:73-76`). Without this the logo
    // 403s from a private bucket.
    const logoPresigned = isManagedStorageUrl(tenant.logoUrl)
      ? await presignFromUrlOrKey(tenant.logoUrl)
      : tenant.logoUrl;

    return json({
      success: true,
      data: {
        logo: logoPresigned || tenant.logoUrl || null,
        primaryColor: tenant.primaryColor || null,
        secondaryColor: tenant.secondaryColor || null,
      },
    });
  } catch {
    return json({ success: true, data: null });
  }
});
