/**
 * bulk-upload — rows reported "success" while silently losing most of the data.
 *
 * `provisionLmsUser` → `registerUser` (centralized auth path, OFF-LIMITS to this
 * migration) writes only a fixed column subset and ignores everything else. So:
 *   - no roll numbers were ever generated (employeeId / studentId / parentCode)
 *   - teachers lost subjects, ratePerClass, rateType, qualification,
 *     monthlyPayout and their availability slots — unschedulable and mis-paid
 *   - parents were never linked to their children, and the deferred
 *     students-first-then-parents auto-link never ran
 *
 * The fix does all of it LMS-side, leaving auth untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  provision: vi.fn(),
  getNextId: vi.fn(),
  userFindFirst: vi.fn(),
  userFindMany: vi.fn(),
  userUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  slotCreateMany: vi.fn(),
  parentUpsert: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/services/identity-service', () => ({ provisionLmsUser: h.provision }));
vi.mock('@/lib/services/counters', () => ({ getNextId: h.getNextId }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: {
      findFirst: h.userFindFirst,
      findMany: h.userFindMany,
      update: h.userUpdate,
      updateMany: h.userUpdateMany,
    },
    lmsUserAvailabilitySlot: { createMany: h.slotCreateMany },
    lmsUserParent: { upsert: h.parentUpsert },
  },
}));

import { uploadTeachers, uploadStudents, uploadParents } from '@/lib/services/bulk-upload-service';

const TEACHER_CSV = [
  'email,firstName,lastName,phone,subjects,ratePerClass,rateType,qualification,monthlyPayout,availability',
  'ada@t.test,Ada,Lovelace,555,Maths;Physics,500,per_class,MSc,20000,1:09:00-17:00;2:10:00-12:00',
].join('\n');

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.userFindFirst.mockResolvedValue(null); // no duplicate email
  h.userFindMany.mockResolvedValue([]);
  h.userUpdate.mockResolvedValue({});
  h.userUpdateMany.mockResolvedValue({ count: 0 });
  h.slotCreateMany.mockResolvedValue({ count: 2 });
  h.parentUpsert.mockResolvedValue({});
  h.provision.mockResolvedValue({ userId: 'u1', tempPassword: 'x', reused: false });
  h.getNextId.mockImplementation(async (_o: string, t: string) =>
    t === 'teacher' ? 'SCH-T-0001' : t === 'student' ? 'SCH-S-0001' : 'SCH-P-0001',
  );
});

describe('teachers — profile fields and availability are persisted', () => {
  it('writes subjects, rates, qualification and payout', async () => {
    await uploadTeachers('org-1', TEACHER_CSV);
    const profileWrite = h.userUpdate.mock.calls.find((c) => c[0].data.subjects);
    expect(profileWrite).toBeDefined();
    expect(profileWrite![0].data).toMatchObject({
      subjects: ['Maths', 'Physics'],
      ratePerClass: 500,
      rateType: 'per_class',
      qualification: 'MSc',
      monthlyPayout: 20000,
    });
  });

  it('creates the availability slots parsed from the CSV', async () => {
    await uploadTeachers('org-1', TEACHER_CSV);
    expect(h.slotCreateMany).toHaveBeenCalledTimes(1);
    expect(h.slotCreateMany.mock.calls[0][0].data).toEqual([
      { userId: 'u1', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
      { userId: 'u1', dayOfWeek: 2, startTime: '10:00', endTime: '12:00' },
    ]);
  });

  it('mints and returns the employee roll number', async () => {
    const out = await uploadTeachers('org-1', TEACHER_CSV);
    expect(h.getNextId).toHaveBeenCalledWith('org-1', 'teacher');
    expect(out.success[0].generatedId).toBe('SCH-T-0001');
  });

  it('still succeeds when a row carries no optional profile fields', async () => {
    const csv = ['email,firstName,lastName', 'bob@t.test,Bob,Smith'].join('\n');
    const out = await uploadTeachers('org-1', csv);
    expect(out.success).toHaveLength(1);
    expect(h.slotCreateMany).not.toHaveBeenCalled();
  });
});

describe('students — roll numbers and parent placeholders', () => {
  it('mints the student roll number', async () => {
    const csv = ['email,firstName,lastName', 'kid@t.test,Kid,One'].join('\n');
    const out = await uploadStudents('org-1', csv);
    expect(h.getNextId).toHaveBeenCalledWith('org-1', 'student');
    expect(out.success[0].generatedId).toBe('SCH-S-0001');
  });

  it('stores an unmatched parentEmail as a deferred placeholder', async () => {
    const csv = ['email,firstName,lastName,parentEmail', 'kid@t.test,Kid,One,mum@t.test'].join('\n');
    h.userFindFirst.mockResolvedValue(null); // parent not found either
    await uploadStudents('org-1', csv);
    const deferred = h.userUpdate.mock.calls.find((c) => c[0].data.parentEmail);
    expect(deferred![0].data.parentEmail).toBe('mum@t.test');
  });
});

describe('parents — children linking and the deferred auto-link', () => {
  const PARENT_CSV = ['email,firstName,lastName,studentEmail', 'mum@t.test,Mum,One,kid@t.test'].join('\n');

  it('links the child named by studentEmail', async () => {
    // 1st findFirst = duplicate-email check (null); 2nd = student lookup.
    h.userFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'child1', role: 'LEARNER' });
    await uploadParents('org-1', PARENT_CSV);
    expect(h.parentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { parentId: 'u1', childId: 'child1' } }),
    );
  });

  it('resolves students uploaded EARLIER with this parent as a placeholder', async () => {
    h.userFindFirst.mockResolvedValue(null); // no duplicate, no studentEmail match
    h.userFindMany.mockResolvedValue([{ id: 'kidA' }, { id: 'kidB' }]);

    await uploadParents('org-1', PARENT_CSV);

    // Both deferred students linked...
    expect(h.parentUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: { parentId: 'u1', childId: 'kidA' } }));
    expect(h.parentUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: { parentId: 'u1', childId: 'kidB' } }));
    // ...and the placeholder cleared, so it cannot re-fire.
    expect(h.userUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['kidA', 'kidB'] } },
      data: { parentEmail: null },
    });
  });

  it('scopes the deferred lookup to the org and to learners', async () => {
    h.userFindFirst.mockResolvedValue(null);
    await uploadParents('org-1', PARENT_CSV);
    expect(h.userFindMany.mock.calls[0][0].where).toMatchObject({
      orgId: 'org-1',
      parentEmail: 'mum@t.test',
      role: 'LEARNER',
    });
  });

  it('mints the parent code', async () => {
    h.userFindFirst.mockResolvedValue(null);
    const out = await uploadParents('org-1', PARENT_CSV);
    expect(out.success[0].generatedId).toBe('SCH-P-0001');
  });

  it('a counter failure does not fail the row — the user still exists', async () => {
    h.userFindFirst.mockResolvedValue(null);
    h.getNextId.mockRejectedValue(new Error('counter table down'));
    const out = await uploadParents('org-1', PARENT_CSV);
    expect(out.success).toHaveLength(1);
    expect(out.success[0].generatedId).toBeUndefined();
    expect(out.failed).toHaveLength(0);
  });
});
