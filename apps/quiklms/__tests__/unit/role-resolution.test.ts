import { describe, it, expect } from 'vitest';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';

/**
 * The coarse platform→LMS mapping. Onboarded tenant admins carry an explicit LMS
 * row or app-role assignment and never reach this fallback (getAuthContext prefers
 * both); it runs for the freshly-invited admin who has neither yet.
 *
 * The third parameter is `isFoundingOrgAdmin` — see the companion suite in
 * founding-admin-role.test.ts for the promotion behaviour and the boundary that
 * keeps `SUPER_ADMIN`-by-role from conferring cross-tenant data access. It replaced
 * `belongsToTenantOrg`, which tried to infer the platform operator from a missing
 * `app_quiklms.tenants` row and got it wrong in both directions.
 */
describe('mapPlatformRoleToLmsRole', () => {
  it('maps a bare org_admin (founding unknown) to TENANT_ADMIN', () => {
    // Without the founding signal the mapping must NOT promote: a caller that
    // cannot establish the fact gets the org-scoped tier.
    expect(mapPlatformRoleToLmsRole('org_admin', false)).toBe('TENANT_ADMIN');
    expect(mapPlatformRoleToLmsRole('org-admin', false)).toBe('TENANT_ADMIN');
    expect(mapPlatformRoleToLmsRole('ORG ADMIN', false)).toBe('TENANT_ADMIN');
  });

  it('honours the platform super-admin flag', () => {
    expect(mapPlatformRoleToLmsRole('member', true)).toBe('SUPER_ADMIN');
    expect(mapPlatformRoleToLmsRole('super_admin', false)).toBe('SUPER_ADMIN');
  });

  it('keeps the explicit tenant_admin/admin membership at TENANT_ADMIN', () => {
    expect(mapPlatformRoleToLmsRole('tenant_admin', false)).toBe('TENANT_ADMIN');
    expect(mapPlatformRoleToLmsRole('admin', false)).toBe('TENANT_ADMIN');
  });

  it('maps app_admin → SUB_ADMIN and member → LEARNER', () => {
    expect(mapPlatformRoleToLmsRole('app_admin', false)).toBe('SUB_ADMIN');
    expect(mapPlatformRoleToLmsRole('member', false)).toBe('LEARNER');
  });

  // Regression: "invited an admin for a new org, logged in as corporate admin".
  // The org's FOUNDING admin is the top tier; a later org_admin is not.
  it('maps the FOUNDING org_admin to SUPER_ADMIN and a later one to TENANT_ADMIN', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false, true)).toBe('SUPER_ADMIN');
    expect(mapPlatformRoleToLmsRole('org_admin', false, false)).toBe('TENANT_ADMIN');
  });

  it('still honours the super-admin flag for a non-founding admin', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', true, false)).toBe('SUPER_ADMIN');
  });

  it('defaults unknown/empty roles to least privilege (LEARNER)', () => {
    expect(mapPlatformRoleToLmsRole(undefined, false)).toBe('LEARNER');
    expect(mapPlatformRoleToLmsRole('', false)).toBe('LEARNER');
    expect(mapPlatformRoleToLmsRole('something_else', false)).toBe('LEARNER');
  });
});
