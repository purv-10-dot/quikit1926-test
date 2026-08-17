import { describe, it, expect, vi } from 'vitest';

// identity-service reaches the database at module load through these; none is
// exercised by the pure mapping under test.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/org-db', () => ({ orgDb: {}, ORG_DB_ENABLED: true }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/services/auth-service', () => ({ registerUser: vi.fn() }));
vi.mock('@/lib/api/seed-lms-app-roles', () => ({
  ensureUserOnLmsRole: vi.fn(),
  LMS_SYSTEM_ADMIN_ROLE: 'admin',
}));
vi.mock('@/lib/api/seed-lms-permissions', () => ({ ensureLmsRbacSeeded: vi.fn() }));

import { toMembershipRole } from '@/lib/services/identity-service';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';

/**
 * The WRITE half of the LMS-role ↔ platform-role bridge.
 *
 * Product decision (2026-08-11): a tenant admin administers their tenant, not the
 * platform, and cannot become a provider. `TENANT_ADMIN` therefore no longer maps
 * to `org_admin` — which had two effects beyond the label: it let them manage the
 * platform org in quikit, and it put them in `ADMIN_TIER_ROLES`, whose app-access
 * rule skips the per-user `UserAppAccess` check entirely.
 */
describe('toMembershipRole', () => {
  it('reserves org_admin for ADMIN alone', () => {
    expect(toMembershipRole('ADMIN')).toBe('org_admin');
  });

  it('stores TENANT_ADMIN as member — no platform-admin tier', () => {
    expect(toMembershipRole('TENANT_ADMIN')).toBe('member');
    expect(toMembershipRole('TENANT_ADMIN')).not.toBe('org_admin');
  });

  it('leaves the rest of the ladder unchanged', () => {
    expect(toMembershipRole('SUB_ADMIN')).toBe('app_admin');
    for (const r of ['MANAGER', 'TEACHER', 'PARENT', 'LEARNER', 'anything-else']) {
      expect(toMembershipRole(r)).toBe('member');
    }
  });
});

/**
 * The property that actually matters: writing a role and reading it back must never
 * hand someone MORE than they had. The old pair failed exactly here —
 * `TENANT_ADMIN → org_admin → ADMIN` promoted a tenant admin into the provider's
 * approval authority over the shared course catalog.
 *
 * `isTenantOrg: true` is the honest input for these, since every one of these roles
 * is provisioned into a tenant org.
 */
describe('round trip never escalates', () => {
  const RANK: Record<string, number> = {
    ADMIN: 6, TENANT_ADMIN: 5, SUB_ADMIN: 4, MANAGER: 3, TEACHER: 2, PARENT: 2, LEARNER: 1,
  };

  for (const role of Object.keys(RANK)) {
    it(`${role} does not come back higher than it went in`, () => {
      const back = mapPlatformRoleToLmsRole(toMembershipRole(role), false, true);
      expect(RANK[back]).toBeLessThanOrEqual(RANK[role]);
    });
  }

  it('TENANT_ADMIN specifically can no longer come back as ADMIN', () => {
    expect(mapPlatformRoleToLmsRole(toMembershipRole('TENANT_ADMIN'), false, true)).not.toBe('ADMIN');
  });

  it('ADMIN in a ROOT org still round-trips exactly', () => {
    // The provider must not be downgraded by the same change.
    expect(mapPlatformRoleToLmsRole(toMembershipRole('ADMIN'), false, false)).toBe('ADMIN');
  });
});
