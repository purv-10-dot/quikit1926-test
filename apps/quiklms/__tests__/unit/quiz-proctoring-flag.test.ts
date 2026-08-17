/**
 * Quiz proctoring is OFF for corporate tenants.
 *
 * Two halves are pinned here:
 *
 *  1. `getFeatures` — corporate resolves `showQuizProctoring:false` and, unlike
 *     every other corporate flag, cannot be switched back on from featureConfig.
 *
 *  2. `requireQuizProctoring` — the server gate, which is deliberately
 *     FAIL-CLOSED where `requireFeature` fails open. That difference is the
 *     whole point: orgs provisioned centrally get an OrgAppAccess row but no
 *     LmsTenant row, and those are exactly the corporate orgs that must not get
 *     webcam proctoring. A fail-open gate would leave it on for precisely the
 *     tenants the flag exists to exempt, so the "no tenant row" case below is
 *     the regression guard that matters most.
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

import { requireQuizProctoring, type AuthUser } from '@/lib/auth/context';
import { getFeatures } from '@/lib/features';

const actor = (over: Partial<AuthUser> = {}): AuthUser =>
  ({
    id: 'u1',
    email: 'a@b.com',
    role: 'TENANT_ADMIN',
    orgId: 'org-1',
    tenantType: 'corporate',
    firstName: 'A',
    lastName: 'B',
    isActive: true,
    isSuperAdmin: false,
    ...over,
  }) as AuthUser;

const tenant = (tenantType: 'corporate' | 'school', featureConfig: unknown = {}) =>
  ({ id: 'org-1', tenantType, featureConfig }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getFeatures — showQuizProctoring', () => {
  it('is off for a corporate tenant', () => {
    expect(getFeatures(tenant('corporate')).showQuizProctoring).toBe(false);
  });

  it('stays off for corporate even if featureConfig tries to enable it', () => {
    expect(
      getFeatures(tenant('corporate', { enableQuizProctoring: true })).showQuizProctoring,
    ).toBe(false);
  });

  it('is on for a school tenant by default', () => {
    expect(getFeatures(tenant('school')).showQuizProctoring).toBe(true);
  });

  it('can be switched off per-tenant for a school', () => {
    expect(
      getFeatures(tenant('school', { enableQuizProctoring: false })).showQuizProctoring,
    ).toBe(false);
  });

  it('leaves exam proctoring untouched — no exam flag is introduced', () => {
    expect(getFeatures(tenant('corporate'))).not.toHaveProperty('showExamProctoring');
  });
});

describe('requireQuizProctoring', () => {
  it('rejects a corporate tenant', async () => {
    h.tenantFindUnique.mockResolvedValue(tenant('corporate'));
    await expect(requireQuizProctoring(actor())).rejects.toThrow(/not enabled/i);
  });

  it('allows a school tenant', async () => {
    h.tenantFindUnique.mockResolvedValue(tenant('school'));
    await expect(requireQuizProctoring(actor({ tenantType: 'school' }))).resolves.toBeUndefined();
  });

  it('rejects a school tenant that opted out', async () => {
    h.tenantFindUnique.mockResolvedValue(tenant('school', { enableQuizProctoring: false }));
    await expect(requireQuizProctoring(actor({ tenantType: 'school' }))).rejects.toThrow(
      /not enabled/i,
    );
  });

  // The regression guard: `requireFeature` returns null (fail OPEN) here, which
  // is why this gate could not simply reuse it.
  it('rejects when the org has NO LmsTenant row (fails closed)', async () => {
    h.tenantFindUnique.mockResolvedValue(null);
    await expect(requireQuizProctoring(actor())).rejects.toThrow(/not enabled/i);
  });

  it('rejects when the tenant lookup throws (fails closed)', async () => {
    h.tenantFindUnique.mockRejectedValue(new Error('db down'));
    await expect(requireQuizProctoring(actor())).rejects.toThrow(/not enabled/i);
  });

  it('rejects when the actor has no orgId', async () => {
    await expect(requireQuizProctoring(actor({ orgId: null as never }))).rejects.toThrow(
      /not enabled/i,
    );
    expect(h.tenantFindUnique).not.toHaveBeenCalled();
  });

  it('lets the platform operator through without reading a tenant', async () => {
    await expect(requireQuizProctoring(actor({ isSuperAdmin: true }))).resolves.toBeUndefined();
    expect(h.tenantFindUnique).not.toHaveBeenCalled();
  });
});
