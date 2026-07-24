/**
 * Tenant status now lives on the platform `quikit.Org`, not on a column of
 * `app_quiklms.tenants` (C-4). The old column was a second source of truth that
 * no gate consulted — "pausing" a tenant in the LMS suspended nothing, because
 * baseline §3 gates on `Org.status`.
 *
 * These pin both halves: the vocabulary mapping, and that the service reads
 * from / writes to the Org.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toTenantStatus, toOrgStatus } from '@/lib/tenant-status';

describe('status vocabulary mapping', () => {
  it('maps the platform vocabulary to the LMS one', () => {
    expect(toTenantStatus('active')).toBe('Active');
    expect(toTenantStatus('suspended')).toBe('Paused');
  });

  it('maps back', () => {
    expect(toOrgStatus('Active')).toBe('active');
    expect(toOrgStatus('Paused')).toBe('suspended');
  });

  it('treats anything that is not explicitly active as Paused', () => {
    // Erring toward "shown as paused" flags an org needing attention rather
    // than hiding a problem behind a healthy-looking badge.
    for (const v of ['canceled', 'pending', '', null, undefined, 'ACTIVE']) {
      expect(toTenantStatus(v as string | null | undefined)).toBe('Paused');
    }
  });

  it('round-trips', () => {
    expect(toTenantStatus(toOrgStatus('Active'))).toBe('Active');
    expect(toTenantStatus(toOrgStatus('Paused'))).toBe('Paused');
  });
});

const h = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  tenantFindMany: vi.fn(),
  tenantUpdate: vi.fn(),
  orgFindUnique: vi.fn(),
  orgFindMany: vi.fn(),
  orgUpdate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsTenant: {
      findUnique: h.tenantFindUnique,
      findMany: h.tenantFindMany,
      update: h.tenantUpdate,
    },
    org: { findUnique: h.orgFindUnique, findMany: h.orgFindMany, update: h.orgUpdate },
  },
}));
vi.mock('@/lib/services/identity-service', () => ({
  provisionOrgForTenant: vi.fn(),
  provisionLmsUser: vi.fn(),
}));

import { findTenant, findAllTenants, updateTenant } from '@/lib/services/tenants-service';

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.tenantFindUnique.mockResolvedValue({ id: 't1', name: 'Acme', featureConfig: {} });
  h.tenantUpdate.mockResolvedValue({ id: 't1', name: 'Acme' });
  h.orgFindUnique.mockResolvedValue({ status: 'active' });
  h.orgUpdate.mockResolvedValue({});
});

describe('reads derive status from the Org', () => {
  it('findTenant reports Active for an active org', async () => {
    expect(await findTenant('t1')).toMatchObject({ id: 't1', status: 'Active' });
  });

  it('findTenant reports Paused for a suspended org', async () => {
    h.orgFindUnique.mockResolvedValue({ status: 'suspended' });
    expect(await findTenant('t1')).toMatchObject({ status: 'Paused' });
  });

  it('findAllTenants attaches each tenant its own org status', async () => {
    h.tenantFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    h.orgFindMany.mockResolvedValue([
      { id: 'a', status: 'active' },
      { id: 'b', status: 'suspended' },
    ]);

    const rows = await findAllTenants();
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['a', 'Active'],
      ['b', 'Paused'],
    ]);
  });

  it('findAllTenants short-circuits with no tenants rather than querying orgs', async () => {
    h.tenantFindMany.mockResolvedValue([]);
    expect(await findAllTenants()).toEqual([]);
    expect(h.orgFindMany).not.toHaveBeenCalled();
  });
});

describe('writes go to the Org, not the tenant row', () => {
  it('a status PATCH suspends the platform org', async () => {
    await updateTenant('t1', { status: 'Paused' });

    expect(h.orgUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'suspended' } });
  });

  it('status is never written to the tenant row', async () => {
    await updateTenant('t1', { status: 'Paused', name: 'Renamed' });

    const data = h.tenantUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('status');
    expect(data).toMatchObject({ name: 'Renamed' });
  });

  it('leaves the org alone when no status is supplied', async () => {
    await updateTenant('t1', { name: 'Renamed' });
    expect(h.orgUpdate).not.toHaveBeenCalled();
  });

  it('returns the status that was just written', async () => {
    h.orgFindUnique
      .mockResolvedValueOnce({ status: 'active' }) // findTenant, before the write
      .mockResolvedValueOnce({ status: 'suspended' }); // read-back, after

    expect(await updateTenant('t1', { status: 'Paused' })).toMatchObject({ status: 'Paused' });
  });
});
