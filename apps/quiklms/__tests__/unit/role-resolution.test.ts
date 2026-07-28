import { describe, it, expect } from 'vitest';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';

/**
 * Regression: the FIRST member of a new org (platform `org_admin`, seeded by
 * apps/quikit super/orgs, with no LMS User row) must resolve to the QuikLMS
 * operator tier SUPER_ADMIN — NOT TENANT_ADMIN. Onboarded school/corporate
 * tenant admins carry an explicit LMS row and are unaffected by this coarse
 * fallback (getAuthContext prefers the row).
 */
describe('mapPlatformRoleToLmsRole', () => {
  it('maps the operator (org_admin) to SUPER_ADMIN', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false)).toBe('SUPER_ADMIN');
    expect(mapPlatformRoleToLmsRole('org-admin', false)).toBe('SUPER_ADMIN');
    expect(mapPlatformRoleToLmsRole('ORG ADMIN', false)).toBe('SUPER_ADMIN');
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

  // Regression: "school admin lands on the super-admin portal". When the caller
  // CAN resolve the org's Tenant row, an org_admin of a real tenant org must map
  // to TENANT_ADMIN, while the operator org (no Tenant row) stays SUPER_ADMIN.
  it('maps org_admin of a real tenant org (Tenant row present) to TENANT_ADMIN', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false, true)).toBe('TENANT_ADMIN');
    expect(mapPlatformRoleToLmsRole('org_admin', false, false)).toBe('SUPER_ADMIN');
  });

  it('still honours the super-admin flag even for a tenant org', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', true, true)).toBe('SUPER_ADMIN');
  });

  it('defaults unknown/empty roles to least privilege (LEARNER)', () => {
    expect(mapPlatformRoleToLmsRole(undefined, false)).toBe('LEARNER');
    expect(mapPlatformRoleToLmsRole('', false)).toBe('LEARNER');
    expect(mapPlatformRoleToLmsRole('something_else', false)).toBe('LEARNER');
  });
});
