import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SUBSCRIPTION_STATUS, TENANT_PLANS } from '@quikit/shared';

/**
 * `provisionOrgForTenant` — the LMS-side org provisioning that mirrors the
 * canonical `apps/auth/register/complete` transaction (baseline §8A).
 *
 * The invariants pinned here are the three defects the gap report found, plus
 * the lockout guard that the central entitlement gate made load-bearing.
 */
const h = vi.hoisted(() => ({
  appFindUnique: vi.fn(),
  orgFindUnique: vi.fn(),
  orgCreate: vi.fn(),
  subscriptionCreate: vi.fn(),
  orgAppAccessCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/org-db', () => ({
  ORG_DB_ENABLED: true,
  orgDb: {
    app: { findUnique: h.appFindUnique },
    org: { findUnique: h.orgFindUnique },
    $transaction: h.transaction,
  },
}));
// Severs the import chain to the real shared PrismaClient (no DATABASE_URL in
// the test env) — none of these are exercised by provisionOrgForTenant.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/services/auth-service', () => ({ registerUser: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email-templates', () => ({ invitationEmail: () => ({ subject: '', html: '' }) }));

import { provisionOrgForTenant } from '@/lib/services/identity-service';

/** Captures the tx client the transaction callback is handed. */
const txStub = () => ({
  org: { create: h.orgCreate },
  subscription: { create: h.subscriptionCreate },
  orgAppAccess: { create: h.orgAppAccessCreate },
});

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.appFindUnique.mockResolvedValue({ id: 'app_lms' });
  h.orgFindUnique.mockResolvedValue(null); // slug is free on the first try
  h.orgCreate.mockResolvedValue({ id: 'org_new' });
  h.subscriptionCreate.mockResolvedValue({});
  h.orgAppAccessCreate.mockResolvedValue({});
  h.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txStub()));
});

describe('provisionOrgForTenant — atomicity', () => {
  it('performs every org-shaped write inside ONE transaction', async () => {
    await provisionOrgForTenant({ name: 'Acme School' });

    expect(h.transaction).toHaveBeenCalledTimes(1);
    // All three writes went through the tx client handed to the callback, not
    // the top-level client — that is what makes a partial failure roll back.
    expect(h.orgCreate).toHaveBeenCalledTimes(1);
    expect(h.subscriptionCreate).toHaveBeenCalledTimes(1);
    expect(h.orgAppAccessCreate).toHaveBeenCalledTimes(1);
  });

  it('returns the new org id', async () => {
    await expect(provisionOrgForTenant({ name: 'Acme School' })).resolves.toBe('org_new');
  });
});

describe('provisionOrgForTenant — billing model', () => {
  it('creates the Subscription row the org was previously missing entirely', async () => {
    await provisionOrgForTenant({ name: 'Acme School' });

    expect(h.subscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'org_new',
          status: SUBSCRIPTION_STATUS.ACTIVE,
          planSlug: TENANT_PLANS.STARTUP,
          source: 'quiklms_tenant_onboarding',
        }),
      }),
    );
  });

  it('sets Org.plan deliberately instead of leaving it to the column default', async () => {
    await provisionOrgForTenant({ name: 'Acme School' });

    expect(h.orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: TENANT_PLANS.STARTUP, status: 'active' }),
      }),
    );
  });
});

describe('provisionOrgForTenant — app entitlement', () => {
  it('THROWS when QuikLMS is absent from the App catalog, instead of silently skipping', async () => {
    // Previously `if (app) { … }` — the org was created with no OrgAppAccess and
    // no error. With the central entitlement gate in place that silently
    // produces a tenant every user is locked out of.
    h.appFindUnique.mockResolvedValue(null);

    await expect(provisionOrgForTenant({ name: 'Acme School' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('does not create the org at all when the App row is missing', async () => {
    h.appFindUnique.mockResolvedValue(null);

    await expect(provisionOrgForTenant({ name: 'Acme School' })).rejects.toThrow();
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.orgCreate).not.toHaveBeenCalled();
  });

  it('enables the app for the org', async () => {
    await provisionOrgForTenant({ name: 'Acme School' });

    expect(h.orgAppAccessCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org_new', appId: 'app_lms', enabled: true }),
      }),
    );
  });
});

describe('provisionOrgForTenant — trial window', () => {
  it('defaults to no trial (trialEndsAt null = active/paid), preserving prior behaviour', async () => {
    await provisionOrgForTenant({ name: 'Acme School' });

    expect(h.orgAppAccessCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ trialEndsAt: null }) }),
    );
  });

  it('honours an explicit trialDays by setting a future expiry', async () => {
    const before = Date.now();
    await provisionOrgForTenant({ name: 'Acme School', trialDays: 14 });

    const arg = h.orgAppAccessCreate.mock.calls[0][0] as { data: { trialEndsAt: Date | null } };
    expect(arg.data.trialEndsAt).toBeInstanceOf(Date);
    const ms = (arg.data.trialEndsAt as Date).getTime() - before;
    expect(ms).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(ms).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000 + 5000);
  });
});

describe('provisionOrgForTenant — audit trail', () => {
  it('records the provisioning operator on the org and the entitlement', async () => {
    await provisionOrgForTenant({ name: 'Acme School', createdByUserId: 'operator1' });

    expect(h.orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdBy: 'operator1' }) }),
    );
    expect(h.orgAppAccessCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ updatedBy: 'operator1' }) }),
    );
  });

  it('omits the audit fields entirely when there is no actor (scripts/backfills)', async () => {
    await provisionOrgForTenant({ name: 'Acme School' });

    const orgArg = h.orgCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(orgArg.data).not.toHaveProperty('createdBy');
  });
});
