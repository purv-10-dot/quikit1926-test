/**
 * GAP_REPORT lists groups as 7 ⚠️ with NO detail, so these were derived by
 * reading `groups.service.ts` / `groups.controller.ts` against the port. Four
 * divergences, none previously recorded:
 *
 *  1. The four mutations returned a BARE group (no memberIds / memberCount)
 *     while the reads returned enriched ones. The UI refetches, so nothing
 *     crashes today — but the contract was inconsistent and `memberIds.length`
 *     on a mutation response would throw.
 *  2. `findAll` was O(3N) queries; the legacy's populate was 2 total.
 *  3. Members were never checked against the tenant (wrong in the legacy too).
 *  4. Duplicate ids tripped @@unique([groupId, userId]) → a confusing 409.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  groupFindFirst: vi.fn(),
  groupFindUnique: vi.fn(),
  groupFindMany: vi.fn(),
  groupCreate: vi.fn(),
  groupUpdate: vi.fn(),
  groupDeleteMany: vi.fn(),
  memberFindMany: vi.fn(),
  memberCreateMany: vi.fn(),
  memberDeleteMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsGroup: {
      findFirst: h.groupFindFirst,
      findUnique: h.groupFindUnique,
      findMany: h.groupFindMany,
      create: h.groupCreate,
      update: h.groupUpdate,
      deleteMany: h.groupDeleteMany,
    },
    lmsGroupMember: { findMany: h.memberFindMany, createMany: h.memberCreateMany, deleteMany: h.memberDeleteMany },
    lmsUser: { findMany: h.userFindMany },
  },
}));

import { create, findAll, findOne, update, addMembers, removeMember } from '@/lib/services/groups-service';

const GROUP = { id: 'g1', orgId: 'org-1', name: 'Sales', description: 'd', createdBy: 'admin1' };
const USER = (id: string) => ({ id, firstName: 'U', lastName: id, email: `${id}@t.test`, role: 'LEARNER', profilePicture: null });

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.groupFindFirst.mockResolvedValue(null);
  h.groupFindUnique.mockResolvedValue(GROUP);
  h.groupFindMany.mockResolvedValue([GROUP]);
  h.groupCreate.mockResolvedValue(GROUP);
  h.groupUpdate.mockResolvedValue(GROUP);
  h.memberFindMany.mockResolvedValue([{ groupId: 'g1', userId: 'u1' }]);
  h.memberCreateMany.mockResolvedValue({ count: 1 });
  h.memberDeleteMany.mockResolvedValue({ count: 1 });
  h.userFindMany.mockImplementation(async ({ where }: any) => (where.id?.in ?? []).map((id: string) => USER(id)));
});

describe('every mutation returns the same enriched shape the reads do', () => {
  it('create returns memberIds + memberCount, not a bare row', async () => {
    h.memberFindMany.mockResolvedValue([{ groupId: 'g1', userId: 'u1' }, { groupId: 'g1', userId: 'u2' }]);
    const out = await create('org-1', 'admin1', { name: 'Sales', memberIds: ['u1', 'u2'] });
    expect(out.memberCount).toBe(2);
    expect(out.memberIds).toHaveLength(2);
    expect(out.memberIds[0]).toMatchObject({ id: 'u1', email: 'u1@t.test' });
  });

  it('update returns an enriched group', async () => {
    // 1st findFirst = load the group; 2nd = the name-conflict probe (no clash).
    h.groupFindFirst.mockResolvedValueOnce(GROUP).mockResolvedValueOnce(null);
    const out = await update('org-1', 'g1', { name: 'Sales EU' });
    expect(out.memberCount).toBe(1);
    expect(Array.isArray(out.memberIds)).toBe(true);
  });

  it('addMembers returns an enriched group', async () => {
    h.groupFindFirst.mockResolvedValue(GROUP);
    const out = await addMembers('org-1', 'g1', { memberIds: ['u1'] });
    expect(out.memberCount).toBe(1);
  });

  it('removeMember returns an enriched group', async () => {
    h.groupFindFirst.mockResolvedValue(GROUP);
    const out = await removeMember('org-1', 'g1', 'u1');
    expect(out.memberCount).toBe(1);
  });

  it('populates createdBy as an object, as the legacy did', async () => {
    const [g] = await findAll('org-1');
    expect(g.createdBy).toMatchObject({ id: 'admin1', email: 'admin1@t.test' });
  });
});

describe('findAll — fixed query count, not O(3N)', () => {
  it('fires a fixed number of queries no matter how many groups exist', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ...GROUP, id: `g${i}`, createdBy: `admin${i}` }));
    h.groupFindMany.mockResolvedValue(many);
    h.memberFindMany.mockResolvedValue(many.map((g) => ({ groupId: g.id, userId: 'u1' })));

    const out = await findAll('org-1');

    expect(out).toHaveLength(25);
    // One links query + one users query — the legacy's populate was 2 as well.
    expect(h.memberFindMany).toHaveBeenCalledTimes(1);
    expect(h.userFindMany).toHaveBeenCalledTimes(1);
  });

  it('returns [] without querying members when there are no groups', async () => {
    h.groupFindMany.mockResolvedValue([]);
    expect(await findAll('org-1')).toEqual([]);
    expect(h.memberFindMany).not.toHaveBeenCalled();
  });

  it('maps each group to its OWN members when several are listed', async () => {
    h.groupFindMany.mockResolvedValue([
      { ...GROUP, id: 'gA', createdBy: null },
      { ...GROUP, id: 'gB', createdBy: null },
    ]);
    h.memberFindMany.mockResolvedValue([
      { groupId: 'gA', userId: 'u1' },
      { groupId: 'gB', userId: 'u2' },
      { groupId: 'gB', userId: 'u3' },
    ]);

    const [a, b] = await findAll('org-1');
    expect(a.memberCount).toBe(1);
    expect(b.memberCount).toBe(2);
    expect(b.memberIds.map((m: any) => m.id)).toEqual(['u2', 'u3']);
  });

  it('drops a member whose user row is gone but keeps the count honest', async () => {
    h.memberFindMany.mockResolvedValue([{ groupId: 'g1', userId: 'u1' }, { groupId: 'g1', userId: 'deleted' }]);
    h.userFindMany.mockResolvedValue([USER('u1')]);
    const [g] = await findAll('org-1');
    expect(g.memberIds).toHaveLength(1);
    expect(g.memberCount).toBe(2); // counted from links, not resolved users
  });
});

describe('members must belong to the tenant', () => {
  it('rejects a foreign user on create', async () => {
    h.userFindMany.mockResolvedValue([USER('u1')]); // 'foreign' not in org-1
    await expect(create('org-1', 'admin1', { name: 'Sales', memberIds: ['u1', 'foreign'] })).rejects.toMatchObject({
      statusCode: 400,
      message: 'One or more users do not belong to this tenant',
    });
    expect(h.groupCreate).not.toHaveBeenCalled();
  });

  it('scopes the member lookup by org', async () => {
    await create('org-1', 'admin1', { name: 'Sales', memberIds: ['u1'] });
    expect(h.userFindMany.mock.calls[0][0].where).toMatchObject({ orgId: 'org-1' });
  });

  it('rejects a foreign user on addMembers', async () => {
    h.groupFindFirst.mockResolvedValue(GROUP);
    h.userFindMany.mockResolvedValue([]);
    await expect(addMembers('org-1', 'g1', { memberIds: ['foreign'] })).rejects.toMatchObject({ statusCode: 400 });
    expect(h.memberCreateMany).not.toHaveBeenCalled();
  });

  it('validates BEFORE writing, so a bad roster cannot leave the name updated', async () => {
    h.groupFindFirst.mockResolvedValueOnce(GROUP).mockResolvedValueOnce(null);
    h.userFindMany.mockResolvedValue([]);
    await expect(update('org-1', 'g1', { name: 'New Name', memberIds: ['foreign'] })).rejects.toMatchObject({ statusCode: 400 });
    expect(h.groupUpdate).not.toHaveBeenCalled();
    expect(h.memberDeleteMany).not.toHaveBeenCalled();
  });
});

describe('duplicate member ids', () => {
  it('de-duplicates on create instead of tripping the unique constraint', async () => {
    await create('org-1', 'admin1', { name: 'Sales', memberIds: ['u1', 'u1', 'u2'] });
    const created = h.groupCreate.mock.calls[0][0].data.members.create;
    expect(created).toEqual([{ userId: 'u1' }, { userId: 'u2' }]);
  });

  it('de-duplicates on addMembers', async () => {
    h.groupFindFirst.mockResolvedValue(GROUP);
    await addMembers('org-1', 'g1', { memberIds: ['u1', 'u1'] });
    expect(h.memberCreateMany.mock.calls[0][0].data).toEqual([{ groupId: 'g1', userId: 'u1' }]);
  });

  it('ignores falsy ids rather than writing empty rows', async () => {
    await create('org-1', 'admin1', { name: 'Sales', memberIds: ['u1', '', null as never] });
    expect(h.groupCreate.mock.calls[0][0].data.members.create).toEqual([{ userId: 'u1' }]);
  });
});

describe('scoping and conflicts still hold', () => {
  it('update wholesale-replaces the roster', async () => {
    h.groupFindFirst.mockResolvedValue(GROUP);
    await update('org-1', 'g1', { memberIds: ['u2'] });
    expect(h.memberDeleteMany).toHaveBeenCalledWith({ where: { groupId: 'g1' } });
    expect(h.memberCreateMany.mock.calls[0][0].data).toEqual([{ groupId: 'g1', userId: 'u2' }]);
  });

  it('an empty roster clears the group', async () => {
    h.groupFindFirst.mockResolvedValue(GROUP);
    await update('org-1', 'g1', { memberIds: [] });
    expect(h.memberDeleteMany).toHaveBeenCalled();
    expect(h.memberCreateMany).not.toHaveBeenCalled();
  });

  it('404s another tenant’s group', async () => {
    h.groupFindFirst.mockResolvedValue(null);
    await expect(findOne('org-2', 'g1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('409s a duplicate group name', async () => {
    h.groupFindFirst.mockResolvedValue({ id: 'other' });
    await expect(create('org-1', 'admin1', { name: 'Sales' })).rejects.toMatchObject({ statusCode: 409 });
  });
});
