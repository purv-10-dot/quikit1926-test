/**
 * Starting a class must never produce a live class nobody can get into.
 *
 * THE BUG. `sendJoinLinkToStudents` — the only "your class is starting" email in
 * the app — opens with `if (!meeting?.joinUrl) return`. Nothing on the scheduling
 * path had ever created a meeting: one existed only if a teacher had separately
 * opened the provider picker on that exact class row. So starting a class from
 * anywhere else marked it `in_progress` and notified NOBODY, silently, and the
 * student calendar (which gates Join on `cls.meetingId`) still had nothing to
 * open.
 *
 * The teacher was worse off again: no path in the app emailed them about a class,
 * ever. The legacy got away with it because the teacher was necessarily the
 * person pressing Start from inside the video flow; an admin can start a class
 * too, and now an invitation hands out the link before anyone opens the app.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  classFindUnique: vi.fn(),
  classUpdate: vi.fn(),
  escalationUpdateMany: vi.fn(),
  meetingFindUnique: vi.fn(),
  meetingFindFirst: vi.fn(),
  batchStudentFindMany: vi.fn(),
  batchFindUnique: vi.fn(),
  batchFindMany: vi.fn(),
  userFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  sendEmail: vi.fn(),
  ensureClassMeeting: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lmsScheduledClass: { findUnique: h.classFindUnique, update: h.classUpdate },
    lmsCallEscalation: { updateMany: h.escalationUpdateMany },
    lmsMeeting: { findUnique: h.meetingFindUnique, findFirst: h.meetingFindFirst },
    lmsBatchStudent: { findMany: h.batchStudentFindMany },
    lmsBatch: { findUnique: h.batchFindUnique, findMany: h.batchFindMany },
    lmsUser: { findMany: h.userFindMany, findUnique: h.userFindUnique, update: h.userUpdate },
  },
}));
vi.mock('@/lib/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/services/class-invitations-service', () => ({
  ensureClassMeeting: h.ensureClassMeeting,
}));

const { startClass } = await import('@/lib/services/scheduling-service');

const CLS = {
  id: 'c1',
  orgId: 'org-1',
  batchId: 'b1',
  teacherId: 't1',
  substituteTeacherId: null,
  title: 'Maths - Grade 8 A',
  startTime: new Date('2026-08-03T09:00:00.000Z'),
  endTime: new Date('2026-08-03T10:00:00.000Z'),
  status: 'scheduled',
  meetingId: null as string | null,
};

const MEETING = {
  id: 'm1',
  joinUrl: 'https://meet.jit.si/room-abc',
  hostUrl: 'https://meet.jit.si/room-abc#host',
  password: null,
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.classFindUnique.mockResolvedValue(CLS);
  h.classUpdate.mockImplementation(async ({ data }: any) => ({ ...CLS, ...data }));
  h.escalationUpdateMany.mockResolvedValue({ count: 0 });
  h.ensureClassMeeting.mockResolvedValue(MEETING);
  h.meetingFindUnique.mockResolvedValue(MEETING);
  h.meetingFindFirst.mockResolvedValue(MEETING);
  h.batchStudentFindMany.mockResolvedValue([{ studentId: 's1' }]);
  h.batchFindUnique.mockResolvedValue({ name: 'Grade 8 A', subject: 'Maths' });
  h.batchFindMany.mockResolvedValue([
    { id: 'b1', name: 'Grade 8 A', grade: '8', subject: 'Maths', students: [{ studentId: 's1' }] },
  ]);
  /**
   * Three different `lmsUser.findMany` reads happen inside one startClass, and
   * they are told apart by their projection, not their order:
   *   `lastName` → hydrateClasses' USER_NAME_SELECT
   *   `id`       → the batch's student roster
   *   neither    → the teacher/substitute host-link lookup
   */
  h.userFindMany.mockImplementation(async ({ where, select }: any) => {
    if (select?.lastName) {
      return [{ id: 't1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@school.test' }];
    }
    if (select?.id) return [{ id: 's1', firstName: 'Sam', email: 'sam@school.test' }];
    return (where.id.in as string[]).map((id) => ({
      firstName: id === 't1' ? 'Ada' : 'Sub',
      email: id === 't1' ? 'ada@school.test' : 'sub@school.test',
    }));
  });
  h.userFindUnique.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
  h.userUpdate.mockResolvedValue({});
  h.sendEmail.mockResolvedValue({ messageId: 'ok' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('startClass provisions the room before announcing it', () => {
  it('ensures a meeting exists for a class that had none', async () => {
    await startClass('org-1', 'c1');

    expect(h.ensureClassMeeting).toHaveBeenCalledWith('org-1', expect.objectContaining({ id: 'c1' }));
  });

  it('returns the class carrying the meeting id it just provisioned', async () => {
    const shaped = (await startClass('org-1', 'c1')) as Record<string, unknown>;

    expect(shaped.meetingId).toBe('m1');
  });

  it('sends the students their join link', async () => {
    await startClass('org-1', 'c1');

    const toStudent = h.sendEmail.mock.calls.find((c) => c[0].to === 'sam@school.test');
    expect(toStudent).toBeDefined();
    expect(toStudent![0].html).toContain(MEETING.joinUrl);
  });

  it('sends the teacher the HOST link — previously no path emailed them at all', async () => {
    await startClass('org-1', 'c1');

    const toTeacher = h.sendEmail.mock.calls.find((c) => c[0].to === 'ada@school.test');
    expect(toTeacher).toBeDefined();
    expect(toTeacher![0].subject).toContain('Your class is live');
    expect(toTeacher![0].html).toContain(MEETING.hostUrl);
  });

  it('starts the class even when no provider could host it', async () => {
    h.ensureClassMeeting.mockResolvedValue(null);
    h.meetingFindUnique.mockResolvedValue(null);
    h.meetingFindFirst.mockResolvedValue(null);

    const shaped = (await startClass('org-1', 'c1')) as Record<string, unknown>;

    expect(shaped.status).toBe('in_progress');
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('starts the class even when provisioning throws', async () => {
    h.ensureClassMeeting.mockRejectedValue(new Error('provider outage'));

    const shaped = (await startClass('org-1', 'c1')) as Record<string, unknown>;

    expect(shaped.status).toBe('in_progress');
  });

  it('refuses a class from another tenant', async () => {
    await expect(startClass('org-2', 'c1')).rejects.toMatchObject({ statusCode: 404 });
    expect(h.ensureClassMeeting).not.toHaveBeenCalled();
  });

  it('refuses to start a class twice', async () => {
    h.classFindUnique.mockResolvedValueOnce({ ...CLS, status: 'in_progress' });

    await expect(startClass('org-1', 'c1')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('a substitute teacher gets the host link too', () => {
  it('mails both the assigned teacher and the substitute', async () => {
    // `startClass` works from the row the UPDATE returned, not the one it read,
    // so the substitute has to be on both for this to exercise the real path.
    const withSub = { ...CLS, substituteTeacherId: 't2' };
    h.classFindUnique.mockResolvedValue(withSub);
    h.classUpdate.mockImplementation(async ({ data }: any) => ({ ...withSub, ...data }));

    await startClass('org-1', 'c1');

    const teacherLookup = h.userFindMany.mock.calls.find(
      (c) => !c[0].select?.lastName && !c[0].select?.id,
    );
    expect(teacherLookup![0].where.id.in).toEqual(['t1', 't2']);
    const recipients = h.sendEmail.mock.calls.map((c) => c[0].to);
    expect(recipients).toEqual(expect.arrayContaining(['ada@school.test', 'sub@school.test']));
  });
});
