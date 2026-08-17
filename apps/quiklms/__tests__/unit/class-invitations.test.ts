/**
 * Scheduling an online class has to reach the people who are supposed to attend it.
 *
 * THE BUG. Creating a batch generated `LmsScheduledClass` rows and stopped. No
 * meeting was created for them and nobody was told, which produced three dead
 * ends at once:
 *
 *  · `sendJoinLinkToStudents` — the app's ONLY class email — begins with
 *    `if (!meeting?.joinUrl) return`. With no meeting it sent nothing, silently.
 *  · The student calendar gates its Join affordance on `cls.meetingId`, which
 *    stayed null, so an enrolled student saw the class and could not open it.
 *  · The teacher was emailed by NO path at all, ever — not on assignment, not on
 *    start. They found out a batch existed by opening the app and looking.
 *
 * A meeting only came into existence when a teacher manually opened the provider
 * picker on one specific class row. Everything downstream waited on that click.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  meetingFindFirst: vi.fn(),
  classUpdate: vi.fn(),
  classFindMany: vi.fn(),
  batchFindFirst: vi.fn(),
  batchStudentFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  userFindMany: vi.fn(),
  createMeeting: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lmsMeeting: { findFirst: h.meetingFindFirst },
    lmsScheduledClass: { update: h.classUpdate, findMany: h.classFindMany },
    lmsBatch: { findFirst: h.batchFindFirst },
    lmsBatchStudent: { findMany: h.batchStudentFindMany },
    lmsUser: { findFirst: h.userFindFirst, findMany: h.userFindMany },
  },
}));
vi.mock('@/lib/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/services/meetings-service', () => ({ createMeeting: h.createMeeting }));

const { ensureClassMeeting, provisionBatchMeetings, sendClassInvitations, announceBatchSchedule } =
  await import('@/lib/services/class-invitations-service');

const CLASS = {
  id: 'c1',
  batchId: 'b1',
  teacherId: 't1',
  title: 'Maths - Grade 8 A',
  startTime: new Date('2026-08-03T09:00:00.000Z'),
  endTime: new Date('2026-08-03T10:00:00.000Z'),
  location: 'Room 4',
  meetingId: null as string | null,
};

const MEETING = {
  id: 'm1',
  joinUrl: 'https://meet.jit.si/Maths-Grade-8-A-qs-abcd1234',
  hostUrl: 'https://meet.jit.si/Maths-Grade-8-A-qs-abcd1234',
  password: null,
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.meetingFindFirst.mockResolvedValue(null);
  h.classUpdate.mockResolvedValue({});
  h.classFindMany.mockResolvedValue([CLASS]);
  h.batchFindFirst.mockResolvedValue({
    id: 'b1',
    name: 'Grade 8 A',
    subject: 'Maths',
    grade: '8',
    teacherId: 't1',
    defaultMeetingProvider: 'jitsi',
  });
  h.batchStudentFindMany.mockResolvedValue([{ studentId: 's1' }, { studentId: 's2' }]);
  h.userFindFirst.mockResolvedValue({
    id: 't1',
    email: 'ada@school.test',
    firstName: 'Ada',
    lastName: 'Lovelace',
    isActive: true,
  });
  h.userFindMany.mockResolvedValue([
    { id: 's1', email: 'sam@school.test', firstName: 'Sam' },
    { id: 's2', email: 'kim@school.test', firstName: 'Kim' },
  ]);
  h.createMeeting.mockResolvedValue(MEETING);
  h.sendEmail.mockResolvedValue({ messageId: 'ok' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ensureClassMeeting — a scheduled class always ends up with a room', () => {
  it('creates one when the class has none', async () => {
    const meeting = await ensureClassMeeting('org-1', CLASS, 'jitsi');

    expect(meeting?.joinUrl).toBe(MEETING.joinUrl);
    expect(h.createMeeting).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ scheduledClassId: 'c1', provider: 'jitsi', title: CLASS.title }),
      't1',
    );
  });

  it('reuses the existing meeting rather than minting a duplicate', async () => {
    h.meetingFindFirst.mockResolvedValueOnce({ ...MEETING, hostUrl: MEETING.hostUrl });

    const meeting = await ensureClassMeeting('org-1', { ...CLASS, meetingId: 'm1' });

    expect(meeting?.id).toBe('m1');
    expect(h.createMeeting).not.toHaveBeenCalled();
  });

  it('finds an orphaned meeting by scheduledClassId and back-links it', async () => {
    h.meetingFindFirst.mockResolvedValueOnce({ ...MEETING, id: 'm9' });

    const meeting = await ensureClassMeeting('org-1', CLASS);

    expect(meeting?.id).toBe('m9');
    expect(h.classUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { meetingId: 'm9' } });
    expect(h.createMeeting).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the org — no cross-tenant meeting reuse', async () => {
    await ensureClassMeeting('org-1', { ...CLASS, meetingId: 'm1' });

    expect(h.meetingFindFirst.mock.calls[0][0].where).toMatchObject({ id: 'm1', orgId: 'org-1' });
  });

  /**
   * The whole point of the fallback. `createMeeting` throws BadRequest for
   * zoom / google_meet when the tenant has no credentials — correct for a
   * teacher's explicit pick, fatal for an automatic provision, because the
   * alternative is a class nobody can join.
   */
  it('falls back to jitsi when the batch provider is not configured', async () => {
    h.createMeeting
      .mockRejectedValueOnce(new Error('Zoom is not configured.'))
      .mockResolvedValueOnce(MEETING);

    const meeting = await ensureClassMeeting('org-1', CLASS, 'zoom');

    expect(meeting?.joinUrl).toBe(MEETING.joinUrl);
    expect(h.createMeeting.mock.calls.map((c) => c[1].provider)).toEqual(['zoom', 'jitsi']);
  });

  it('returns null rather than throwing when no provider can host it', async () => {
    h.createMeeting.mockRejectedValue(new Error('everything is down'));

    await expect(ensureClassMeeting('org-1', CLASS, 'zoom')).resolves.toBeNull();
  });
});

describe('provisionBatchMeetings — near-term only, never a whole academic year', () => {
  it('caps the window and skips cancelled or already-finished classes', async () => {
    await provisionBatchMeetings('org-1', 'b1', { from: new Date('2026-08-01T00:00:00.000Z') });

    const args = h.classFindMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      orgId: 'org-1',
      batchId: 'b1',
      status: { notIn: ['cancelled', 'rescheduled', 'completed'] },
    });
    expect(args.where.startTime.gte).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(args.where.startTime.lte).toEqual(new Date('2026-08-15T00:00:00.000Z'));
    // The cap bounds work done inside the batch-create request — each class costs
    // a create plus, for zoom/google_meet, an external API call.
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual({ startTime: 'asc' });
  });

  it('uses the batch provider it was configured with', async () => {
    h.batchFindFirst.mockResolvedValueOnce({ defaultMeetingProvider: 'google_meet' });

    await provisionBatchMeetings('org-1', 'b1');

    expect(h.createMeeting.mock.calls[0][1].provider).toBe('google_meet');
  });
});

describe('sendClassInvitations — the teacher AND the students get told', () => {
  it('emails the assigned teacher, which no path did before', async () => {
    const res = await sendClassInvitations('org-1', 'b1');

    expect(res.teacherNotified).toBe(true);
    const toTeacher = h.sendEmail.mock.calls.find((c) => c[0].to === 'ada@school.test');
    expect(toTeacher).toBeDefined();
    expect(toTeacher![0].subject).toContain('Maths');
  });

  it('emails every enrolled student', async () => {
    const res = await sendClassInvitations('org-1', 'b1');

    expect(res.studentsNotified).toBe(2);
    expect(h.sendEmail.mock.calls.map((c) => c[0].to)).toEqual(
      expect.arrayContaining(['sam@school.test', 'kim@school.test']),
    );
  });

  it('puts a real, joinable link in the invitation', async () => {
    await sendClassInvitations('org-1', 'b1');

    const toStudent = h.sendEmail.mock.calls.find((c) => c[0].to === 'sam@school.test');
    expect(toStudent![0].html).toContain(MEETING.joinUrl);
  });

  it('gives the teacher the HOST link, not the participant link', async () => {
    h.createMeeting.mockResolvedValue({ ...MEETING, hostUrl: 'https://host.example/room' });

    await sendClassInvitations('org-1', 'b1');

    const toTeacher = h.sendEmail.mock.calls.find((c) => c[0].to === 'ada@school.test');
    expect(toTeacher![0].html).toContain('https://host.example/room');
  });

  it('narrows to the arrivals when students join a running batch', async () => {
    h.userFindMany.mockResolvedValueOnce([{ id: 's3', email: 'new@school.test', firstName: 'Nia' }]);
    h.batchStudentFindMany.mockResolvedValueOnce([{ studentId: 's3' }]);

    const res = await sendClassInvitations('org-1', 'b1', { studentIds: ['s3'], notifyTeacher: false });

    expect(h.batchStudentFindMany.mock.calls[0][0].where).toMatchObject({
      batchId: 'b1',
      studentId: { in: ['s3'] },
    });
    expect(res.teacherNotified).toBe(false);
    expect(res.studentsNotified).toBe(1);
  });

  /**
   * An empty `studentIds` is a real instruction — "tell the teacher only" — used by
   * a teacher swap, where the students' slots have not moved. `.length` is falsy on
   * `[]`, so testing it would have widened this to the whole roster: the opposite.
   */
  it('treats an empty studentIds as "teacher only", not "everyone"', async () => {
    const res = await sendClassInvitations('org-1', 'b1', { studentIds: [] });

    expect(res.teacherNotified).toBe(true);
    expect(res.studentsNotified).toBe(0);
    expect(h.batchStudentFindMany).not.toHaveBeenCalled();
    expect(h.sendEmail.mock.calls.map((c) => c[0].to)).toEqual(['ada@school.test']);
  });

  it('says "updated" rather than "you have a new class" when the schedule moved', async () => {
    await sendClassInvitations('org-1', 'b1', { kind: 'update' });

    expect(h.sendEmail.mock.calls[0][0].subject).toContain('updated');
  });

  it('skips inactive students — a deactivated account is not a recipient', async () => {
    await sendClassInvitations('org-1', 'b1');

    expect(h.userFindMany.mock.calls[0][0].where).toMatchObject({ orgId: 'org-1', isActive: true });
  });

  it('does nothing for a batch with no upcoming classes', async () => {
    h.classFindMany.mockResolvedValueOnce([]);

    const res = await sendClassInvitations('org-1', 'b1');

    expect(res).toEqual({
      teacherNotified: false,
      studentsNotified: 0,
      classesCovered: 0,
      meetingsProvisioned: 0,
    });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('refuses a batch from another tenant', async () => {
    h.batchFindFirst.mockResolvedValueOnce(null);

    const res = await sendClassInvitations('org-2', 'b1');

    expect(res.classesCovered).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('still invites the students when the teacher has no mailbox', async () => {
    h.userFindFirst.mockResolvedValueOnce({ id: 't1', email: null, firstName: 'Ada', isActive: true });

    const res = await sendClassInvitations('org-1', 'b1');

    expect(res.teacherNotified).toBe(false);
    expect(res.studentsNotified).toBe(2);
  });

  it('an unsendable invitation is not counted as delivered', async () => {
    h.sendEmail.mockRejectedValue(new Error('SMTP refused'));

    const res = await sendClassInvitations('org-1', 'b1');

    expect(res.teacherNotified).toBe(false);
    expect(res.studentsNotified).toBe(0);
  });
});

describe('announceBatchSchedule never fails the batch it is describing', () => {
  it('swallows a failure — the batch has already committed by then', async () => {
    h.batchFindFirst.mockRejectedValue(new Error('connection pool exhausted'));

    await expect(announceBatchSchedule('org-1', 'b1')).resolves.toBeNull();
  });
});
