/**
 * A new batch has to reach the teacher's and the students' calendars.
 *
 * THE BUG. `getTeacherClasses` and `getStudentClasses` read `LmsScheduledClass`
 * and NOTHING else — the batch row itself is invisible to both. So the generated
 * classes ARE the calendars, and `create()` wrapped `generateClasses` in a bare
 * `catch {}`. A failure there produced exactly the reported symptom: the batch
 * lists correctly on the admin side, both calendars stay empty, and no log line
 * anywhere says why.
 *
 * The second half is that nothing announced the schedule. No meeting was created
 * for the generated classes and no invitation was sent, so the classes existed
 * but were unreachable and unannounced — see class-invitations.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userCount: vi.fn(),
  batchFindFirst: vi.fn(),
  batchFindUnique: vi.fn(),
  batchCreate: vi.fn(),
  batchUpdate: vi.fn(),
  batchStudentCreateMany: vi.fn(),
  batchStudentFindMany: vi.fn(),
  validateTeacherSchedule: vi.fn(),
  generateClasses: vi.fn(),
  cancelFutureClassesForBatch: vi.fn(),
  announceBatchSchedule: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: {
      findFirst: h.userFindFirst,
      findUnique: h.userFindUnique,
      findMany: h.userFindMany,
      count: h.userCount,
    },
    lmsBatch: {
      findFirst: h.batchFindFirst,
      findUnique: h.batchFindUnique,
      create: h.batchCreate,
      update: h.batchUpdate,
    },
    lmsBatchStudent: { createMany: h.batchStudentCreateMany, findMany: h.batchStudentFindMany },
  },
}));
vi.mock('@/lib/services/scheduling-service', () => ({
  validateTeacherSchedule: h.validateTeacherSchedule,
  generateClasses: h.generateClasses,
  cancelFutureClassesForBatch: h.cancelFutureClassesForBatch,
}));
vi.mock('@/lib/services/class-invitations-service', () => ({
  announceBatchSchedule: h.announceBatchSchedule,
}));

const { create, addStudents, update } = await import('@/lib/services/batches-service');

const SCHEDULE = [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }];

const DTO = {
  name: 'Grade 8 A',
  subject: 'Maths',
  teacherId: 't1',
  academicYear: '2026-2027',
  startDate: '2026-08-01',
  endDate: '2027-03-31',
  schedule: SCHEDULE,
  studentIds: ['s1', 's2'],
};

const SHAPED = {
  id: 'b1',
  orgId: 'org-1',
  teacherId: 't1',
  status: 'active',
  schedule: SCHEDULE,
  students: [{ studentId: 's1' }, { studentId: 's2' }],
  substituteTeachers: [],
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.userFindFirst.mockResolvedValue({ id: 't1', role: 'TEACHER', orgId: 'org-1', isActive: true });
  h.userFindUnique.mockResolvedValue({ id: 't1', firstName: 'Ada', lastName: 'Lovelace' });
  h.userFindMany.mockResolvedValue([]);
  h.userCount.mockImplementation(async ({ where }: any) => where.id.in.length);
  h.batchFindFirst.mockResolvedValue(null);
  h.batchCreate.mockResolvedValue({ id: 'b1', status: 'active' });
  h.batchFindUnique.mockResolvedValue(SHAPED);
  h.batchUpdate.mockResolvedValue({ id: 'b1', status: 'active' });
  h.batchStudentCreateMany.mockResolvedValue({ count: 2 });
  h.batchStudentFindMany.mockResolvedValue([]);
  h.validateTeacherSchedule.mockResolvedValue([{ available: true }]);
  h.generateClasses.mockResolvedValue([{ id: 'c1' }]);
  h.announceBatchSchedule.mockResolvedValue({
    teacherNotified: true,
    studentsNotified: 2,
    classesCovered: 1,
    meetingsProvisioned: 1,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('creating a batch populates both calendars', () => {
  it('generates the scheduled classes that ARE the calendars', async () => {
    await create('org-1', DTO as never, 'admin-1');

    expect(h.generateClasses).toHaveBeenCalledWith('org-1', { batchId: 'b1' });
  });

  it('invites the teacher and the students to them', async () => {
    await create('org-1', DTO as never, 'admin-1');

    expect(h.announceBatchSchedule).toHaveBeenCalledWith('org-1', 'b1', { kind: 'invitation' });
  });

  it('does neither for a draft batch — nothing is on anyone’s calendar yet', async () => {
    h.batchCreate.mockResolvedValueOnce({ id: 'b1', status: 'draft' });

    await create('org-1', { ...DTO, status: 'draft' } as never, 'admin-1');

    expect(h.generateClasses).not.toHaveBeenCalled();
    expect(h.announceBatchSchedule).not.toHaveBeenCalled();
  });

  /**
   * The failure is still non-blocking — the batch has committed and an admin can
   * regenerate — but it is no longer INVISIBLE. A bare `catch {}` here is what
   * turned "class generation broke" into "the feature does not work" with nothing
   * to grep for.
   */
  it('logs a generation failure instead of swallowing it, and still saves the batch', async () => {
    h.generateClasses.mockRejectedValueOnce(new Error('unique constraint'));

    await expect(create('org-1', DTO as never, 'admin-1')).resolves.toBeTruthy();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('class generation failed for batch b1'),
      expect.any(Error),
    );
  });

  it('still sends the invitations when generation partly failed', async () => {
    h.generateClasses.mockRejectedValueOnce(new Error('unique constraint'));

    await create('org-1', DTO as never, 'admin-1');

    expect(h.announceBatchSchedule).toHaveBeenCalled();
  });
});

describe('enrolling a student into a running batch tells that student', () => {
  it('invites only the arrivals, and does not re-announce to the teacher', async () => {
    h.batchFindUnique.mockResolvedValue({ ...SHAPED, maxCapacity: null });
    h.userFindMany.mockResolvedValueOnce([{ id: 's3' }]);

    await addStudents('org-1', 'b1', { studentIds: ['s3'] });

    expect(h.announceBatchSchedule).toHaveBeenCalledWith('org-1', 'b1', {
      studentIds: ['s3'],
      kind: 'invitation',
      notifyTeacher: false,
    });
  });

  it('stays quiet for a batch that is not active yet', async () => {
    h.batchFindUnique.mockResolvedValue({ ...SHAPED, status: 'draft', maxCapacity: null });
    h.userFindMany.mockResolvedValueOnce([{ id: 's3' }]);

    await addStudents('org-1', 'b1', { studentIds: ['s3'] });

    expect(h.announceBatchSchedule).not.toHaveBeenCalled();
  });
});

describe('moving a batch’s schedule tells everyone whose week changed', () => {
  it('regenerates the classes and announces the change', async () => {
    await update('org-1', 'b1', { schedule: SCHEDULE } as never);

    expect(h.cancelFutureClassesForBatch).toHaveBeenCalled();
    expect(h.generateClasses).toHaveBeenCalledWith('org-1', { batchId: 'b1' });
    expect(h.announceBatchSchedule).toHaveBeenCalledWith('org-1', 'b1', { kind: 'update' });
  });

  it('tells only the new teacher on a swap — the students’ slots have not moved', async () => {
    h.batchFindUnique.mockResolvedValue({ ...SHAPED, teacherId: 't1' });

    await update('org-1', 'b1', { teacherId: 't2' } as never);

    expect(h.generateClasses).not.toHaveBeenCalled();
    expect(h.announceBatchSchedule).toHaveBeenCalledWith('org-1', 'b1', {
      kind: 'invitation',
      studentIds: [],
    });
  });

  it('says nothing when only cosmetic fields changed', async () => {
    await update('org-1', 'b1', { description: 'nicer blurb' } as never);

    expect(h.announceBatchSchedule).not.toHaveBeenCalled();
  });

  /**
   * The batch form posts the WHOLE form on every save, so `studentIds` is always
   * present. Announcing on "the field was supplied" mailed every student and the
   * teacher again for a capacity tweak.
   */
  it('does not re-invite anyone when the roster was resubmitted unchanged', async () => {
    h.batchStudentFindMany.mockResolvedValueOnce([{ studentId: 's1' }, { studentId: 's2' }]);

    await update('org-1', 'b1', { maxCapacity: 40, studentIds: ['s1', 's2'] } as never);

    expect(h.announceBatchSchedule).not.toHaveBeenCalled();
  });

  it('invites only the students the resubmitted roster actually added', async () => {
    h.batchStudentFindMany.mockResolvedValueOnce([{ studentId: 's1' }]);

    await update('org-1', 'b1', { studentIds: ['s1', 's2'] } as never);

    expect(h.announceBatchSchedule).toHaveBeenCalledWith('org-1', 'b1', {
      studentIds: ['s2'],
      kind: 'invitation',
      notifyTeacher: false,
    });
  });
});
