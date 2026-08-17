/**
 * GAP_REPORT §3.2 users. Of the three findings, ONE was real:
 *
 *  ✅ REAL — `excludeRoles` became a fallback (`else if`) instead of an override.
 *     The legacy assigns `baseFilter.role = role` then unconditionally
 *     reassigns `baseFilter.role = { $nin: excludeRoles }` (`users.service.ts:48-53`).
 *     `GET /users/search` has NO role guard (parity), and the route passes
 *     excludeRoles=['TEACHER','PARENT'] for corporate tenants — so with an
 *     `else if`, ANY authenticated learner could enumerate hidden staff via
 *     `?role=TEACHER`. That is the test that matters most here.
 *
 *  ❌ WRONG — "gained a silent take: 20 cap where the original was unbounded".
 *     The legacy caps at 20 in EVERY branch (`:60`, `:81+:98`, `:116`).
 *
 *  ❌ WRONG (for findAll) — the legacy DOES use an else-if chain in `findAll`
 *     (`:130-141`), which the port already matched. The two functions are
 *     genuinely inconsistent upstream; both are reproduced as-is.
 *
 * Also fixed: prefix-before-contains ranking (report missed it) and the
 * `availableSlots` capability regression.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { lmsUser: { findMany: h.findMany, findFirst: h.findFirst, update: h.update } },
}));
/**
 * `users-service` gained a `sendEmail` import (the address-change welcome), and
 * `lib/email` validates the whole server env at MODULE LOAD — so importing the
 * service under test threw "Invalid environment configuration" before a single
 * assertion ran, and this entire file reported zero tests. Mocked rather than
 * env-stubbed: nothing here exercises mail, and a test suite that needs a live
 * DATABASE_URL to check a Prisma `where` clause is the wrong dependency.
 */
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue({ messageId: 'stub' }) }));

import { searchUsers, findAllUsers, updateUser } from '@/lib/services/users-service';

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.findMany.mockResolvedValue([]);
  h.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.test', orgId: 'org-1' });
  h.update.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));
});

const whereOf = (call: number) => h.findMany.mock.calls[call][0].where;

describe('searchUsers — corporate exclusion cannot be bypassed', () => {
  it('?role=TEACHER does NOT defeat excludeRoles', async () => {
    await searchUsers('org-1', undefined, 'TEACHER', ['TEACHER', 'PARENT']);
    // The exclusion overwrites the requested role — a learner cannot enumerate staff.
    expect(whereOf(0).role).toEqual({ notIn: ['TEACHER', 'PARENT'] });
    expect(whereOf(0).role).not.toBe('TEACHER');
  });

  it('honours ?role when there is nothing to exclude (school tenant)', async () => {
    await searchUsers('org-1', undefined, 'TEACHER', []);
    expect(whereOf(0).role).toBe('TEACHER');
  });

  it('excludes by default with no role asked for', async () => {
    await searchUsers('org-1', undefined, undefined, ['TEACHER', 'PARENT']);
    expect(whereOf(0).role).toEqual({ notIn: ['TEACHER', 'PARENT'] });
  });

  it('scopes to the org and to active users', async () => {
    await searchUsers('org-1');
    expect(whereOf(0)).toMatchObject({ orgId: 'org-1', isActive: true });
  });

  it('spans all orgs for a super admin (no orgId)', async () => {
    await searchUsers(undefined);
    expect(whereOf(0).orgId).toBeUndefined();
  });
});

describe('searchUsers — ranking and caps (legacy parity)', () => {
  it('caps an empty query at 20, as the legacy always did', async () => {
    await searchUsers('org-1');
    expect(h.findMany.mock.calls[0][0].take).toBe(20);
  });

  it('returns prefix matches BEFORE contains matches, 10 + 10', async () => {
    h.findMany
      .mockResolvedValueOnce([{ id: 'p1', firstName: 'Ada' }])
      .mockResolvedValueOnce([{ id: 'c1', firstName: 'Amadadu' }]);

    const out = await searchUsers('org-1', 'ada');

    expect(out.map((u: { id: string }) => u.id)).toEqual(['p1', 'c1']);
    expect(h.findMany.mock.calls[0][0].take).toBe(10);
    expect(h.findMany.mock.calls[1][0].take).toBe(10);
    // Prefix pass matches firstName/lastName by startsWith — not email.
    expect(whereOf(0).OR).toEqual([
      { firstName: { startsWith: 'ada', mode: 'insensitive' } },
      { lastName: { startsWith: 'ada', mode: 'insensitive' } },
    ]);
  });

  it('never repeats a prefix hit in the contains pass', async () => {
    h.findMany.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }]).mockResolvedValueOnce([]);
    await searchUsers('org-1', 'ada');
    expect(whereOf(1).id).toEqual({ notIn: ['p1', 'p2'] });
  });

  it('applies the exclusion to BOTH passes — not just the first', async () => {
    h.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await searchUsers('org-1', 'ada', 'TEACHER', ['TEACHER', 'PARENT']);
    expect(whereOf(0).role).toEqual({ notIn: ['TEACHER', 'PARENT'] });
    expect(whereOf(1).role).toEqual({ notIn: ['TEACHER', 'PARENT'] });
  });

  it('multi-word search is a single AND query capped at 20', async () => {
    await searchUsers('org-1', 'ada lovelace');
    expect(h.findMany).toHaveBeenCalledTimes(1);
    expect(h.findMany.mock.calls[0][0].take).toBe(20);
    expect(whereOf(0).AND).toHaveLength(2);
  });
});

describe('findAllUsers — the legacy else-if chain is preserved', () => {
  it('?role=TEACHER DOES win over excludeRoles here (legacy inconsistency, reproduced)', async () => {
    await findAllUsers('org-1', undefined, 'TEACHER', ['TEACHER', 'PARENT']);
    expect(whereOf(0).role).toBe('TEACHER');
  });

  it('?role=SUB_ADMIN filters on the primary role only (single-role model)', async () => {
    await findAllUsers('org-1', undefined, 'SUB_ADMIN', []);
    expect(whereOf(0).role).toBe('SUB_ADMIN');
    expect(whereOf(0).OR).toBeUndefined();
  });

  it('is not capped — the legacy findAll had no limit', async () => {
    await findAllUsers('org-1');
    expect(h.findMany.mock.calls[0][0].take).toBeUndefined();
  });
});

describe('updateUser — availableSlots capability restored', () => {
  it('replaces the schedule wholesale, as the legacy assignment did', async () => {
    await updateUser('u1', 'org-1', {
      availableSlots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }],
    });

    expect(h.update.mock.calls[0][0].data.availableSlots).toEqual({
      deleteMany: {},
      create: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }],
    });
  });

  it('an empty array clears the schedule rather than being ignored', async () => {
    await updateUser('u1', 'org-1', { availableSlots: [] });
    expect(h.update.mock.calls[0][0].data.availableSlots).toEqual({ deleteMany: {}, create: [] });
  });

  it('leaves the schedule untouched when the field is absent', async () => {
    await updateUser('u1', 'org-1', { firstName: 'Ada' });
    expect(h.update.mock.calls[0][0].data.availableSlots).toBeUndefined();
  });

  it('still rejects a cross-org edit', async () => {
    h.findFirst.mockResolvedValue(null);
    await expect(updateUser('u1', 'org-2', { firstName: 'x' })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateUser — role / parentIds / childrenIds restored to legacy parity', () => {
  it('accepts a role change (the route is admin-only, as it was in the legacy)', async () => {
    await updateUser('u1', 'org-1', { role: 'TEACHER' });
    expect(h.update.mock.calls[0][0].data.role).toBe('TEACHER');
  });

  it('rejects an unknown role with a 400 rather than letting Prisma 500', async () => {
    // The route body is passthrough(), so this is the only validation point.
    await expect(updateUser('u1', 'org-1', { role: 'ROOT' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid role: ROOT',
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('leaves role alone when not supplied', async () => {
    await updateUser('u1', 'org-1', { firstName: 'Ada' });
    expect(h.update.mock.calls[0][0].data.role).toBeUndefined();
  });

  it('replaces parentIds through the join table, from the child side', async () => {
    await updateUser('u1', 'org-1', { parentIds: ['p1', 'p2'] });
    expect(h.update.mock.calls[0][0].data.parents).toEqual({
      deleteMany: {},
      create: [{ parentId: 'p1' }, { parentId: 'p2' }],
    });
  });

  it('replaces childrenIds from the parent side', async () => {
    await updateUser('u1', 'org-1', { childrenIds: ['c1'] });
    expect(h.update.mock.calls[0][0].data.children).toEqual({
      deleteMany: {},
      create: [{ childId: 'c1' }],
    });
  });

  it('drops falsy ids, as the legacy .filter(Boolean) did', async () => {
    await updateUser('u1', 'org-1', { parentIds: ['p1', '', null, 'p2'] });
    expect(h.update.mock.calls[0][0].data.parents.create).toEqual([{ parentId: 'p1' }, { parentId: 'p2' }]);
  });

  it('an empty array unlinks every parent', async () => {
    await updateUser('u1', 'org-1', { parentIds: [] });
    expect(h.update.mock.calls[0][0].data.parents).toEqual({ deleteMany: {}, create: [] });
  });
});
