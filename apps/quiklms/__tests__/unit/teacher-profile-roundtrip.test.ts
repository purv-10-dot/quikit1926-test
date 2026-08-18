/**
 * A teacher's Subject and Availability must survive the round trip.
 *
 * THE BUG, in two halves.
 *
 * HALF ONE — the read. `GET /api/users` is the only teacher read the Teachers
 * page has; there is no per-teacher detail endpoint. Its projection carried
 * `subjects` but NOT `availableSlots`, `ratePerClass`, `rateType`,
 * `qualification` or `monthlyPayout`. So a teacher created with a full weekly
 * schedule rendered as "+ Set Availability" and payout "-" the moment the list
 * reloaded — data that had persisted correctly, presented as lost. Worse, the
 * edit modal then reopened prefilled with its own defaults (rate 500,
 * qualification "") and the next save wrote those over the real values.
 *
 * The availability column is the one that breaks a whole flow, because
 * `validateTeacherSchedule` refuses a teacher with zero slots — so the admin was
 * told to "set the teacher's weekly availability" for a teacher whose
 * availability was already in the database.
 *
 * HALF TWO — the write. `applyTeacherProfile` wrote the scalars and the slots as
 * two awaits under ONE best-effort catch in `enrichRosterUser`. `rateType` and
 * `qualification` are Postgres enums, so a single stale option value from an
 * older client rejected the scalar update — and took the availability insert,
 * which had not run yet, down with it. Both halves of the profile vanished with
 * only a console line to show for it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  createManySlots: vi.fn(),
  getNextId: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { findMany: h.findMany, findFirst: h.findFirst, update: h.update },
    lmsUserAvailabilitySlot: { createMany: h.createManySlots },
  },
}));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/services/counters', () => ({ getNextId: h.getNextId }));

const { findAllUsers, updateUser } = await import('@/lib/services/users-service');
const { applyTeacherProfile, enrichRosterUser } = await import('@/lib/services/roster-profile');

const SLOT = { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.findMany.mockResolvedValue([]);
  h.findFirst.mockResolvedValue({ id: 't1', email: 'ada@school.test', orgId: 'org-1' });
  h.update.mockResolvedValue({ id: 't1' });
  h.createManySlots.mockResolvedValue({ count: 1 });
  h.getNextId.mockResolvedValue('SCH-T-0001');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the roster list returns what the teacher form collected', () => {
  it('asks for the weekly availability slots', async () => {
    await findAllUsers('org-1', undefined, 'TEACHER');

    const select = h.findMany.mock.calls[0][0].select;
    expect(select.availableSlots).toEqual({
      select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
    });
  });

  it('asks for subjects, pay rate, rate type, qualification and payout', async () => {
    await findAllUsers('org-1', undefined, 'TEACHER');

    const select = h.findMany.mock.calls[0][0].select;
    expect(select).toMatchObject({
      subjects: true,
      ratePerClass: true,
      ratePerHour: true,
      rateType: true,
      qualification: true,
      monthlyPayout: true,
      tutoringEnabled: true,
      tutoringCreditCost: true,
    });
  });

  it('returns the same fields from a PATCH, so the edit modal cannot regress them', async () => {
    await updateUser('t1', 'org-1', { subjects: ['Maths'] });

    const select = h.update.mock.calls[0][0].select;
    expect(select.availableSlots).toBeDefined();
    expect(select.qualification).toBe(true);
    expect(select.rateType).toBe(true);
  });
});

describe('one bad field cannot take the whole teacher profile with it', () => {
  it('still writes the availability when the scalar update fails', async () => {
    h.update.mockRejectedValueOnce(new Error('enum value out of range'));

    await applyTeacherProfile('t1', { subjects: ['Maths'], availableSlots: [SLOT] });

    expect(h.createManySlots).toHaveBeenCalledWith({
      data: [{ userId: 't1', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
      skipDuplicates: true,
    });
  });

  it('still writes the subjects when the availability insert fails', async () => {
    h.createManySlots.mockRejectedValueOnce(new Error('deadlock'));

    await applyTeacherProfile('t1', { subjects: ['Maths'], availableSlots: [SLOT] });

    expect(h.update.mock.calls[0][0].data).toMatchObject({ subjects: ['Maths'] });
  });

  it('reports failure only when nothing at all landed', async () => {
    h.update.mockRejectedValueOnce(new Error('db down'));
    h.createManySlots.mockRejectedValueOnce(new Error('db down'));

    await expect(
      applyTeacherProfile('t1', { subjects: ['Maths'], availableSlots: [SLOT] }),
    ).rejects.toThrow('db down');
  });

  it('and enrichRosterUser still swallows that, because the account exists', async () => {
    h.update.mockRejectedValue(new Error('db down'));
    h.createManySlots.mockRejectedValue(new Error('db down'));

    await expect(
      enrichRosterUser('t1', 'org-1', 'TEACHER', { subjects: ['Maths'], availableSlots: [SLOT] }),
    ).resolves.toBeDefined();
  });
});

describe('enum-backed columns are coerced, not thrown at Postgres', () => {
  it('drops an out-of-enum qualification and keeps everything around it', async () => {
    await applyTeacherProfile('t1', {
      subjects: ['Maths'],
      qualification: 'M.Sc', // not an LmsUserQualification member
      ratePerClass: 500,
    });

    const data = h.update.mock.calls[0][0].data;
    expect(data.qualification).toBeUndefined();
    expect(data).toMatchObject({ subjects: ['Maths'], ratePerClass: 500 });
  });

  it('drops an out-of-enum rate type the same way', async () => {
    await applyTeacherProfile('t1', { subjects: ['Maths'], rateType: 'weekly' });

    expect(h.update.mock.calls[0][0].data.rateType).toBeUndefined();
  });

  it('accepts the real members, case-insensitively', async () => {
    await applyTeacherProfile('t1', { qualification: 'pgt', rateType: 'PER_CLASS' });

    expect(h.update.mock.calls[0][0].data).toMatchObject({
      qualification: 'PGT',
      rateType: 'per_class',
    });
  });
});
