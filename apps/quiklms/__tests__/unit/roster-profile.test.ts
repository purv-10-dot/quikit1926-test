/**
 * A teacher created from the Teachers page must come out COMPLETE.
 *
 * THE BUG. `registerUser` writes a fixed column subset. The CSV importer knew
 * that and applied the rest itself; the single-person roster form did not. So a
 * teacher added through the UI was created with no subjects, no pay rate, no
 * employee id and — the one that breaks a whole flow — no availability slots.
 *
 * Zero slots is not a cosmetic gap. `validateTeacherSchedule` refuses a teacher
 * who has none, and `batches-service.create` calls it for every batch with a
 * schedule (which the batch form requires). The teacher therefore appeared in
 * the batch form's dropdown and could never actually be saved into a batch,
 * while the same person imported from a CSV worked fine.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  update: vi.fn(),
  createManySlots: vi.fn(),
  getNextId: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { update: h.update },
    lmsUserAvailabilitySlot: { createMany: h.createManySlots },
  },
}));
vi.mock('@/lib/services/counters', () => ({ getNextId: h.getNextId }));

const { enrichRosterUser, normalizeAvailabilitySlots, applyTeacherProfile } = await import(
  '@/lib/services/roster-profile'
);

const SLOT = { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.getNextId.mockResolvedValue('SCH-T-0001');
  h.update.mockResolvedValue({});
  h.createManySlots.mockResolvedValue({ count: 1 });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a teacher created from the roster form is schedulable', () => {
  it('persists the availability slots the form collected', async () => {
    await enrichRosterUser('u1', 'org-1', 'TEACHER', { availableSlots: [SLOT] });

    expect(h.createManySlots).toHaveBeenCalledWith({
      data: [{ userId: 'u1', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
      skipDuplicates: true,
    });
  });

  // `qualification` is `LmsUserQualification` (PGT/TGT/PRT/NTT/Other) and
  // `rateType` is `LmsRateType` — both real Postgres enums, so this case uses
  // real members. It previously asserted `qualification: 'M.Sc'`, which Prisma
  // rejects: the update threw, `enrichRosterUser` swallowed it, and the whole
  // teacher profile — subjects and availability included — was silently dropped.
  // Out-of-enum values are now discarded field-by-field instead
  // (see teacher-profile-roundtrip.test.ts).
  it('persists subjects, rate, rate type, qualification and payout', async () => {
    await enrichRosterUser('u1', 'org-1', 'TEACHER', {
      subjects: ['Maths', 'Physics'],
      ratePerClass: 500,
      rateType: 'per_class',
      qualification: 'PGT',
      monthlyPayout: 40000,
    });

    const written = h.update.mock.calls.find((c) => c[0].data.subjects)?.[0].data;
    expect(written).toMatchObject({
      subjects: ['Maths', 'Physics'],
      ratePerClass: 500,
      rateType: 'per_class',
      qualification: 'PGT',
      monthlyPayout: 40000,
    });
  });

  it('mints the per-tenant employee id', async () => {
    const { generatedId } = await enrichRosterUser('u1', 'org-1', 'TEACHER', {});

    expect(h.getNextId).toHaveBeenCalledWith('org-1', 'teacher');
    expect(h.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { employeeId: 'SCH-T-0001' } });
    expect(generatedId).toBe('SCH-T-0001');
  });

  it('accepts a numeric rate that arrived as a string from the form', async () => {
    await enrichRosterUser('u1', 'org-1', 'TEACHER', { ratePerClass: '750' });

    const written = h.update.mock.calls.find((c) => c[0].data.ratePerClass)?.[0].data;
    expect(written?.ratePerClass).toBe(750);
  });
});

describe('learners and parents get their roll numbers too', () => {
  it('mints a student id for a LEARNER', async () => {
    h.getNextId.mockResolvedValue('SCH-S-0007');
    const { generatedId } = await enrichRosterUser('u2', 'org-1', 'LEARNER', {});

    expect(h.getNextId).toHaveBeenCalledWith('org-1', 'student');
    expect(h.update).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { studentId: 'SCH-S-0007' } });
    expect(generatedId).toBe('SCH-S-0007');
  });

  it('mints a parent code for a PARENT', async () => {
    h.getNextId.mockResolvedValue('SCH-P-0003');
    await enrichRosterUser('u3', 'org-1', 'PARENT', {});

    expect(h.update).toHaveBeenCalledWith({ where: { id: 'u3' }, data: { parentCode: 'SCH-P-0003' } });
  });

  it('never overwrites an id the admin typed in', async () => {
    const { generatedId } = await enrichRosterUser('u4', 'org-1', 'TEACHER', { employeeId: 'EMP-42' });

    expect(h.getNextId).not.toHaveBeenCalled();
    expect(generatedId).toBe('EMP-42');
  });

  it('does not mint anything for an admin role', async () => {
    const { generatedId } = await enrichRosterUser('u5', 'org-1', 'SUB_ADMIN', {});

    expect(h.getNextId).not.toHaveBeenCalled();
    expect(generatedId).toBeUndefined();
  });

  it('leaves a LEARNER alone apart from the roll number', async () => {
    // Teacher columns must not be written for a non-teacher, even if the body
    // happens to carry them.
    await enrichRosterUser('u6', 'org-1', 'LEARNER', { subjects: ['Maths'], availableSlots: [SLOT] });

    expect(h.createManySlots).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][0].data).toEqual({ studentId: 'SCH-T-0001' });
  });
});

describe('availability slots are validated before they become rows', () => {
  it('drops malformed slots instead of writing them', () => {
    const kept = normalizeAvailabilitySlots([
      SLOT,
      { dayOfWeek: 9, startTime: '09:00', endTime: '17:00' }, // no such day
      { dayOfWeek: 2, startTime: '25:00', endTime: '17:00' }, // not a time
      { dayOfWeek: 3, startTime: '09:00' }, // no end
      'nonsense',
    ]);

    expect(kept).toEqual([SLOT]);
  });

  it('drops a slot that ends before it starts — it can never match a lesson', () => {
    expect(normalizeAvailabilitySlots([{ dayOfWeek: 1, startTime: '17:00', endTime: '09:00' }])).toEqual([]);
  });

  it('survives a non-array', () => {
    expect(normalizeAvailabilitySlots(undefined)).toEqual([]);
    expect(normalizeAvailabilitySlots('09:00')).toEqual([]);
  });
});

describe('enrichment never costs the caller their account', () => {
  it('a failed roll number does not throw — the user already exists', async () => {
    h.getNextId.mockRejectedValue(new Error('counter row locked'));

    const { generatedId } = await enrichRosterUser('u1', 'org-1', 'TEACHER', {});

    expect(generatedId).toBeUndefined();
  });

  it('a failed profile write does not throw either', async () => {
    h.update.mockRejectedValueOnce(new Error('db down'));

    await expect(
      enrichRosterUser('u1', 'org-1', 'TEACHER', { subjects: ['Maths'] }),
    ).resolves.toBeDefined();
  });

  it('writes nothing at all when the form supplied no teacher fields', async () => {
    await applyTeacherProfile('u1', {});

    expect(h.update).not.toHaveBeenCalled();
    expect(h.createManySlots).not.toHaveBeenCalled();
  });
});
