/**
 * Credit package definitions moved from the `LmsTenant.creditConfig` JSON blob
 * to the `LmsCreditPackageDefinition` table (schema change approved by the
 * product owner, 2026-07-18).
 *
 * Every edit used to be a read-modify-write of the whole config object, so two
 * admins editing packages concurrently silently lost one edit — and the blob
 * rewrite could clobber a concurrent change to any OTHER creditConfig key
 * (expiryMonths, lowCreditThreshold, zeroCreditPolicy). Mongo's `$push`/`$pull`
 * on the subdocument array could not lose a sibling write that way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  defFindMany: vi.fn(),
  defCreate: vi.fn(),
  defUpdateMany: vi.fn(),
  defDeleteMany: vi.fn(),
  tenantFindUnique: vi.fn(),
  tenantUpdate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsCreditPackageDefinition: {
      findMany: h.defFindMany,
      create: h.defCreate,
      updateMany: h.defUpdateMany,
      deleteMany: h.defDeleteMany,
    },
    lmsTenant: { findUnique: h.tenantFindUnique, update: h.tenantUpdate },
    lmsCreditPackage: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    lmsCreditTransaction: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import {
  getPackageDefinitions,
  createPackageDefinition,
  updatePackageDefinition,
  deletePackageDefinition,
} from '@/lib/services/credits-service';

const DTO = { name: 'Starter', credits: 10, price: 999, validityMonths: 6 };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.defFindMany.mockResolvedValue([]);
  h.defCreate.mockImplementation(async ({ data }: any) => ({ id: 'def1', ...data }));
  h.defUpdateMany.mockResolvedValue({ count: 1 });
  h.defDeleteMany.mockResolvedValue({ count: 1 });
  h.tenantFindUnique.mockResolvedValue({ creditConfig: {} });
});

describe('definitions live in their own table', () => {
  it('creates a row instead of rewriting the tenant config blob', async () => {
    const out = await createPackageDefinition('org-1', DTO);
    expect(h.defCreate).toHaveBeenCalledTimes(1);
    expect(h.defCreate.mock.calls[0][0].data).toMatchObject({ orgId: 'org-1', ...DTO, isActive: true });
    // The blob is never touched, so a concurrent edit to another config key survives.
    expect(h.tenantUpdate).not.toHaveBeenCalled();
    expect(out.id).toBe('def1');
  });

  it('honours an explicit isActive: false', async () => {
    await createPackageDefinition('org-1', { ...DTO, isActive: false });
    expect(h.defCreate.mock.calls[0][0].data.isActive).toBe(false);
  });

  it('updates one row atomically, scoped to the org', async () => {
    await updatePackageDefinition('org-1', 'def1', { price: 1299 });
    expect(h.defUpdateMany).toHaveBeenCalledWith({
      where: { id: 'def1', orgId: 'org-1' },
      data: { price: 1299 },
    });
    expect(h.tenantUpdate).not.toHaveBeenCalled();
  });

  it('only writes the fields actually supplied', async () => {
    await updatePackageDefinition('org-1', 'def1', { name: 'Pro' });
    expect(h.defUpdateMany.mock.calls[0][0].data).toEqual({ name: 'Pro' });
  });

  it('404s an update against another tenant’s definition', async () => {
    h.defUpdateMany.mockResolvedValue({ count: 0 });
    await expect(updatePackageDefinition('org-2', 'def1', { price: 1 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes scoped to the org', async () => {
    await deletePackageDefinition('org-1', 'def1');
    expect(h.defDeleteMany).toHaveBeenCalledWith({ where: { id: 'def1', orgId: 'org-1' } });
  });

  it('404s a delete against another tenant’s definition', async () => {
    h.defDeleteMany.mockResolvedValue({ count: 0 });
    await expect(deletePackageDefinition('org-2', 'def1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reads from the table when rows exist', async () => {
    h.defFindMany.mockResolvedValue([{ id: 'def1', name: 'Starter' }]);
    const out = await getPackageDefinitions('org-1');
    expect(out).toHaveLength(1);
    expect(h.tenantFindUnique).not.toHaveBeenCalled();
  });

  it('falls back to the legacy blob for tenants not yet migrated', async () => {
    h.defFindMany.mockResolvedValue([]);
    h.tenantFindUnique.mockResolvedValue({ creditConfig: { packages: [{ id: 'old1', name: 'Legacy' }] } });
    const out = await getPackageDefinitions('org-1');
    expect(out).toEqual([{ id: 'old1', name: 'Legacy' }]);
  });

  it('returns [] when there is neither a row nor a legacy blob', async () => {
    expect(await getPackageDefinitions('org-1')).toEqual([]);
  });
});
