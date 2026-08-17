import { describe, it, expect } from 'vitest';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';

/**
 * The coarse platform→LMS mapping. Onboarded tenant admins carry an explicit LMS
 * row or app-role assignment and never reach this fallback (getAuthContext prefers
 * both); it runs for the freshly-invited admin who has neither yet.
 *
 * `org_admin` maps unconditionally to `ADMIN` — quikscale parity (removed
 * 2026-08-04). It used to depend on a third "is this the org's founding admin"
 * argument, so only the earliest admin-tier OrgMember got ADMIN and every later
 * `org_admin` got TENANT_ADMIN; see founding-admin-role.test.ts for the boundary
 * that keeps `ADMIN`-by-role from conferring cross-tenant data access.
 */
describe('mapPlatformRoleToLmsRole', () => {
  it('maps org_admin to ADMIN, unconditionally', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false)).toBe('ADMIN');
    expect(mapPlatformRoleToLmsRole('org-admin', false)).toBe('ADMIN');
    expect(mapPlatformRoleToLmsRole('ORG ADMIN', false)).toBe('ADMIN');
  });

  it('honours the platform super-admin flag', () => {
    expect(mapPlatformRoleToLmsRole('member', true)).toBe('ADMIN');
    expect(mapPlatformRoleToLmsRole('super_admin', false)).toBe('ADMIN');
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
  // Every org_admin is the top tier now, first invite or fifth.
  it('maps every org_admin to ADMIN, first invite or fifth', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false)).toBe('ADMIN');
  });

  it('still honours the super-admin flag independently of the membership role', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', true)).toBe('ADMIN');
  });

  it('defaults unknown/empty roles to least privilege (LEARNER)', () => {
    expect(mapPlatformRoleToLmsRole(undefined, false)).toBe('LEARNER');
    expect(mapPlatformRoleToLmsRole('', false)).toBe('LEARNER');
    expect(mapPlatformRoleToLmsRole('something_else', false)).toBe('LEARNER');
  });
});
