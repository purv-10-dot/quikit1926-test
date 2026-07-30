/**
 * `requireFeature` — the tenant feature gate.
 *
 * It was a no-op stub (`return { … } as never`) that permitted every feature
 * for every tenant. These pin the real behaviour, including the two deliberate
 * fail-open paths: a guard that black-outs a tenant on a transient DB fault is
 * worse than one that briefly lets a disabled feature through.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  hasCentralAppAccess: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: h.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { findUnique: h.userFindUnique },
    lmsTenant: { findUnique: h.tenantFindUnique },
  },
}));
vi.mock('@/lib/auth/central-access', () => ({ hasCentralAppAccess: h.hasCentralAppAccess }));

import { requireFeature, type AuthUser } from '@/lib/auth/context';

const actor = (over: Partial<AuthUser> = {}): AuthUser =>
  ({
    id: 'u1',
    email: 'a@b.com',
    role: 'TENANT_ADMIN',
    secondaryRole: null,
    orgId: 'org-1',
    tenantType: 'school',
    firstName: 'A',
    lastName: 'B',
    isActive: true,
    isSuperAdmin: false,
    ...over,
  }) as AuthUser;

/** A school tenant with batches switched OFF in its featureConfig. */
const schoolNoBatches = {
  id: 'org-1',
  tenantType: 'school' as const,
  featureConfig: { enableBatches: false },
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.hasCentralAppAccess.mockResolvedValue(true);
  h.tenantFindUnique.mockResolvedValue({ id: 'org-1', tenantType: 'school', featureConfig: {} });
});

describe('requireFeature — enforcement', () => {
  it('throws 403 when the feature is disabled for the tenant', async () => {
    h.tenantFindUnique.mockResolvedValue(schoolNoBatches);

    await expect(requireFeature(actor(), 'showBatches')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows a feature that is enabled', async () => {
    h.tenantFindUnique.mockResolvedValue(schoolNoBatches);

    // Same tenant, a feature its config does not disable.
    await expect(requireFeature(actor(), 'showAttendance')).resolves.toMatchObject({ id: 'org-1' });
  });

  it('applies the tenantType matrix — a school never gets corporate-only features', async () => {
    h.tenantFindUnique.mockResolvedValue({ id: 'org-1', tenantType: 'school', featureConfig: {} });

    await expect(requireFeature(actor(), 'showCourses')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('and a corporate tenant never gets school-only features', async () => {
    h.tenantFindUnique.mockResolvedValue({ id: 'org-1', tenantType: 'corporate', featureConfig: {} });

    await expect(
      requireFeature(actor({ tenantType: 'corporate' }), 'showBatches'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('scopes the lookup to the actor org — never a client-supplied id', async () => {
    await requireFeature(actor(), 'showAttendance');

    expect(h.tenantFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org-1' } }),
    );
  });
});

describe('requireFeature — deliberate fail-open paths', () => {
  it('lets the platform OPERATOR through without reading a tenant row', async () => {
    // Keyed on the `isSuperAdmin` claim, not the LMS role: the operator's own org
    // has no tenant row to read a feature config from.
    await expect(
      requireFeature(actor({ role: 'SUPER_ADMIN', isSuperAdmin: true }), 'showBatches'),
    ).resolves.toBeNull();
    expect(h.tenantFindUnique).not.toHaveBeenCalled();
  });

  it('still reads the tenant row for a founding admin whose ROLE is SUPER_ADMIN', async () => {
    // Regression: an org's founding admin resolves to an LMS role of SUPER_ADMIN
    // (lib/auth/founding-admin.ts) but HAS a tenant. Short-circuiting on the role
    // returned null here, which silently disabled every feature flag for them.
    h.tenantFindUnique.mockResolvedValue({ id: 'org-1', tenantType: 'school', featureConfig: {} });
    await expect(
      requireFeature(actor({ role: 'SUPER_ADMIN', isSuperAdmin: false }), 'showBatches'),
    ).resolves.toEqual({ id: 'org-1', tenantType: 'school' });
    expect(h.tenantFindUnique).toHaveBeenCalled();
  });

  it('allows when the org has no LmsTenant row (operator / not yet onboarded)', async () => {
    h.tenantFindUnique.mockResolvedValue(null);

    await expect(requireFeature(actor(), 'showBatches')).resolves.toBeNull();
  });

  it('allows when the lookup throws — a DB blip must not black out the tenant', async () => {
    h.tenantFindUnique.mockRejectedValue(new Error('db down'));

    await expect(requireFeature(actor(), 'showBatches')).resolves.toBeNull();
  });

  it('allows when the actor has no org', async () => {
    await expect(requireFeature(actor({ orgId: null }), 'showBatches')).resolves.toBeNull();
    expect(h.tenantFindUnique).not.toHaveBeenCalled();
  });
});
