/**
 * teacher-availability — slot replacement was `deleteMany` + `createMany` +
 * `update` with NO transaction. A failure after the delete wiped the teacher's
 * entire weekly availability with nothing to replace it (next read:
 * `availabilityConfigured: false`, `availableSlots: []`), and a concurrent read
 * landing mid-operation saw an empty schedule.
 *
 * The legacy replaced the embedded array in one `teacher.save()`
 * (`teacher-availability.service.ts:31-33`) and could never do this.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
  slotDeleteMany: vi.fn(),
  slotCreateMany: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsUser: { findFirst: h.userFindFirst, findUnique: h.userFindUnique, update: h.userUpdate },
    lmsUserAvailabilitySlot: { deleteMany: h.slotDeleteMany, createMany: h.slotCreateMany },
    lmsBatch: { findMany: vi.fn() },
    $transaction: h.transaction,
  },
}));

import { updateAvailableSlots } from '@/lib/services/teacher-availability-service';

const SLOTS = [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }];

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.userFindFirst.mockResolvedValue({ id: 't1', orgId: 'org-1', role: 'TEACHER' });
  h.userFindUnique.mockResolvedValue({ id: 't1', availableSlots: [] });
  h.slotDeleteMany.mockResolvedValue({ count: 0 });
  h.slotCreateMany.mockResolvedValue({ count: 1 });
  h.userUpdate.mockResolvedValue({});
  h.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      lmsUserAvailabilitySlot: { deleteMany: h.slotDeleteMany, createMany: h.slotCreateMany },
      lmsUser: { update: h.userUpdate },
    }),
  );
});

describe('updateAvailableSlots is all-or-nothing', () => {
  it('runs delete + create + update inside ONE transaction', async () => {
    await updateAvailableSlots('org-1', 't1', SLOTS, 20);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.slotDeleteMany).toHaveBeenCalledWith({ where: { userId: 't1' } });
    expect(h.slotCreateMany).toHaveBeenCalled();
    expect(h.userUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { maxSlotsPerWeek: 20 } });
  });

  it('propagates a create failure so the transaction rolls back', async () => {
    h.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        lmsUserAvailabilitySlot: {
          deleteMany: h.slotDeleteMany,
          createMany: vi.fn().mockRejectedValue(new Error('constraint')),
        },
        lmsUser: { update: h.userUpdate },
      }),
    );
    await expect(updateAvailableSlots('org-1', 't1', SLOTS)).rejects.toThrow('constraint');
  });

  it('clearing the schedule deletes without creating', async () => {
    await updateAvailableSlots('org-1', 't1', []);
    expect(h.slotDeleteMany).toHaveBeenCalled();
    expect(h.slotCreateMany).not.toHaveBeenCalled();
  });

  it('leaves maxSlotsPerWeek alone when not supplied', async () => {
    await updateAvailableSlots('org-1', 't1', SLOTS);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('404s an unknown teacher before touching any slots', async () => {
    h.userFindFirst.mockResolvedValue(null);
    await expect(updateAvailableSlots('org-1', 'nope', SLOTS)).rejects.toMatchObject({ statusCode: 404 });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('is org-scoped — another tenant’s teacher is not found', async () => {
    h.userFindFirst.mockResolvedValue(null);
    await expect(updateAvailableSlots('org-2', 't1', SLOTS)).rejects.toMatchObject({ statusCode: 404 });
    expect(h.userFindFirst.mock.calls[0][0].where).toMatchObject({ orgId: 'org-2', role: 'TEACHER' });
  });
});
