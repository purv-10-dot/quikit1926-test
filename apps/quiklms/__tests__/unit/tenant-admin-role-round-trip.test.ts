import { describe, it, expect } from 'vitest';

import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';

/**
 * REGRESSION — a tenant admin silently became a platform ADMIN.
 *
 * QuikLMS has 7 roles, the platform has 4, so `toMembershipRole` squeezes the LMS
 * role into a central one. It used to send BOTH `ADMIN` and `TENANT_ADMIN` to
 * `org_admin` — and reading that back could only guess, so it always answered
 * `ADMIN`. The round trip therefore PROMOTED a tenant admin:
 *
 *     TENANT_ADMIN → org_admin → ADMIN
 *
 * ADMIN is not a cosmetic difference. `assertCanActOnGlobalCourse` lets an ADMIN
 * approve, reject, publish, archive and duplicate master courses submitted by their
 * org — so a tenant admin reaching this path acquired the provider's approval
 * authority over the shared catalog.
 *
 * Two fixes, and this file covers the read half. The write half now stores
 * TENANT_ADMIN as `member` (see `toMembershipRole`); this argument is what protects
 * everyone provisioned BEFORE that, whose stored value is still `org_admin`.
 *
 * The signal is the ORG, not the user: both people carry the same central role, but
 * only a tenant org has an `app_quiklms.tenants` row. That is what `isTenantOrg`
 * carries.
 */
describe('mapPlatformRoleToLmsRole — org_admin is ambiguous', () => {
  it('resolves org_admin in a TENANT org to TENANT_ADMIN, not ADMIN', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false, true)).toBe('TENANT_ADMIN');
  });

  it('resolves org_admin in a ROOT org to ADMIN', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', false, false)).toBe('ADMIN');
  });

  it('keeps the historical ADMIN answer when the caller cannot tell', () => {
    // The argument is optional so no existing caller changes behaviour by omission.
    expect(mapPlatformRoleToLmsRole('org_admin', false)).toBe('ADMIN');
    expect(mapPlatformRoleToLmsRole('org_admin')).toBe('ADMIN');
  });

  it('applies to the aliases that share the org_admin branch', () => {
    for (const alias of ['owner', 'administrator', 'ORG_ADMIN', 'org admin']) {
      expect(mapPlatformRoleToLmsRole(alias, false, true)).toBe('TENANT_ADMIN');
      expect(mapPlatformRoleToLmsRole(alias, false, false)).toBe('ADMIN');
    }
  });

  /**
   * The operator claim is checked BEFORE the role switch, so being inside a tenant
   * org must not demote them — they are cross-tenant by definition and routinely
   * act inside one.
   */
  it('never demotes the platform operator, tenant org or not', () => {
    expect(mapPlatformRoleToLmsRole('org_admin', true, true)).toBe('ADMIN');
    expect(mapPlatformRoleToLmsRole('member', true, true)).toBe('ADMIN');
  });

  it('leaves every other membership role untouched by the new argument', () => {
    const cases: Array<[string, string]> = [
      ['super_admin', 'ADMIN'],
      ['admin', 'TENANT_ADMIN'],
      ['tenant_admin', 'TENANT_ADMIN'],
      ['app_admin', 'SUB_ADMIN'],
      ['sub_admin', 'SUB_ADMIN'],
      ['manager', 'MANAGER'],
      ['teacher', 'TEACHER'],
      ['parent', 'PARENT'],
      ['member', 'LEARNER'],
      ['', 'LEARNER'],
    ];
    for (const [input, expected] of cases) {
      expect(mapPlatformRoleToLmsRole(input, false, true)).toBe(expected);
      expect(mapPlatformRoleToLmsRole(input, false, false)).toBe(expected);
    }
  });

  /**
   * The write half, asserted from the read side: a NEW tenant admin is stored as
   * `member`, so the fallback answers LEARNER. Wrong, but wrong in the safe
   * direction — a lockout rather than a promotion to the top tier. Pinned so nobody
   * "fixes" it by mapping member+tenant → TENANT_ADMIN, which would hand every
   * learner in that tenant the admin role.
   */
  it('fails CLOSED for a newly-stored tenant admin (member), never open', () => {
    expect(mapPlatformRoleToLmsRole('member', false, true)).toBe('LEARNER');
    expect(mapPlatformRoleToLmsRole('member', false, true)).not.toBe('TENANT_ADMIN');
  });
});
