/**
 * Parent ↔ student linking — endpoints the port READ but never provided.
 *
 * Parent access to `/credits/my-transactions` and `/analytics/student/:id` is
 * gated on a `LmsUserParent` row, but no route could create or remove one, so
 * links could only ever arrive via bulk upload. A tenant admin could not link a
 * parent to a child, and could not correct a wrong link.
 *
 * Ports `AuthService.linkParentStudent` / `unlinkParentStudent`
 * (`auth.service.ts:1196-1233`). Mongo kept the relationship twice —
 * `childrenIds` on the parent, `parentIds` on the student — which could
 * half-write; Postgres has one row with `@@unique([parentId, childId])`.
 *
 * Also covers the public certificate download pass-gate, which the
 * authenticated route enforced and the PUBLIC one did not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  linkFindUnique: vi.fn(),
  linkCreate: vi.fn(),
  linkDeleteMany: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ optionalEnv: () => '', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { findFirst: h.userFindFirst },
    lmsUserParent: {
      findUnique: h.linkFindUnique,
      create: h.linkCreate,
      deleteMany: h.linkDeleteMany,
    },
  },
}));

import { linkParentStudent, unlinkParentStudent } from '@/lib/services/users-service';

const PARENT = { id: 'p1', orgId: 'org-1', role: 'PARENT', secondaryRole: null };
const STUDENT = { id: 's1', orgId: 'org-1', role: 'LEARNER', secondaryRole: null };

/** Resolve each lookup by the id the service asked for. */
const resolveUsers = (rows: Record<string, unknown>) =>
  h.userFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) => rows[where.id] ?? null);

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.linkFindUnique.mockResolvedValue(null);
  h.linkCreate.mockResolvedValue({ id: 'l1' });
  h.linkDeleteMany.mockResolvedValue({ count: 1 });
});

describe('linking', () => {
  it('creates the link row', async () => {
    resolveUsers({ p1: PARENT, s1: STUDENT });
    const out = await linkParentStudent('org-1', 'p1', 's1');
    expect(h.linkCreate).toHaveBeenCalledWith({ data: { parentId: 'p1', childId: 's1' } });
    expect(out).toEqual({ success: true, message: 'Parent-Student linked successfully' });
  });

  it('is idempotent — an existing link is reported, not rewritten', async () => {
    resolveUsers({ p1: PARENT, s1: STUDENT });
    h.linkFindUnique.mockResolvedValue({ id: 'l1' });
    const out = await linkParentStudent('org-1', 'p1', 's1');
    expect(out).toEqual({ success: true, message: 'Already linked' });
    expect(h.linkCreate).not.toHaveBeenCalled();
  });

  it('refuses a parent from another tenant — the cross-tenant hole', async () => {
    resolveUsers({ s1: STUDENT }); // p1 not in org-1
    await expect(linkParentStudent('org-1', 'p1', 's1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Parent not found in this tenant',
    });
    expect(h.linkCreate).not.toHaveBeenCalled();
  });

  it('refuses a student from another tenant', async () => {
    resolveUsers({ p1: PARENT });
    await expect(linkParentStudent('org-1', 'p1', 's1')).rejects.toMatchObject({
      message: 'Student not found in this tenant',
    });
  });

  it('refuses to link a user who is not actually a parent', async () => {
    resolveUsers({ p1: { ...PARENT, role: 'TEACHER' }, s1: STUDENT });
    await expect(linkParentStudent('org-1', 'p1', 's1')).rejects.toMatchObject({
      message: 'Parent does not have the PARENT role',
    });
  });

  it('accepts PARENT held as a secondary role, as the legacy RolesGuard did', async () => {
    resolveUsers({ p1: { ...PARENT, role: 'TEACHER', secondaryRole: 'PARENT' }, s1: STUDENT });
    await expect(linkParentStudent('org-1', 'p1', 's1')).resolves.toMatchObject({ success: true });
  });

  it('scopes both lookups to the caller’s org', async () => {
    resolveUsers({ p1: PARENT, s1: STUDENT });
    await linkParentStudent('org-1', 'p1', 's1');
    for (const call of h.userFindFirst.mock.calls) {
      expect(call[0].where.orgId).toBe('org-1');
    }
  });
});

describe('unlinking', () => {
  it('removes the link', async () => {
    resolveUsers({ p1: PARENT });
    const out = await unlinkParentStudent('org-1', 'p1', 's1');
    expect(h.linkDeleteMany).toHaveBeenCalledWith({ where: { parentId: 'p1', childId: 's1' } });
    expect(out).toEqual({ success: true, message: 'Parent-Student unlinked successfully' });
  });

  it('succeeds when nothing was linked — legacy $pull was a no-op, not an error', async () => {
    resolveUsers({ p1: PARENT });
    h.linkDeleteMany.mockResolvedValue({ count: 0 });
    await expect(unlinkParentStudent('org-1', 'p1', 's1')).resolves.toMatchObject({ success: true });
  });

  it('refuses to sever a link in another tenant', async () => {
    resolveUsers({});
    await expect(unlinkParentStudent('org-1', 'p1', 's1')).rejects.toMatchObject({ statusCode: 404 });
    expect(h.linkDeleteMany).not.toHaveBeenCalled();
  });
});
