/**
 * GAP_REPORT §3.2 course-assignments — "The reminder queue is never triggered.
 * Original called handleNewAssignment(assignmentId) per new USER assignment. New
 * omits it, citing the worker — but the worker claims 'the immediate reminder is
 * sent at assign time by the REST layer.' Both sides believe the other does it.
 * Nobody does."
 *
 * Scope note: only the IMMEDIATE "assigned" email was lost. The legacy's day-10 /
 * day-20 BullMQ scheduling is already replaced by the worker's daily scan of
 * `assignedAt` windows — a deliberate substitution (BullMQ is not installed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  // Pinned before import — buildAssignedHtml resolves APP_URL at module load
  // from NEXTAUTH_URL (the platform-standard self-origin var).
  process.env.NEXTAUTH_URL = 'https://lms.test';
});

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  assignmentFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  masterFindUnique: vi.fn(),
  courseFindUnique: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsCourseAssignment: { findUnique: h.assignmentFindUnique },
    lmsUser: { findUnique: h.userFindUnique },
    lmsMasterCourse: { findUnique: h.masterFindUnique },
    lmsCourse: { findUnique: h.courseFindUnique },
  },
}));

import { sendAssignmentAssignedEmail, handleNewAssignments } from '@/lib/services/course-assignment-reminders-service';

const IN_10_DAYS = new Date(Date.now() + 10 * 86_400_000);

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.assignmentFindUnique.mockResolvedValue({
    id: 'a1', courseId: 'c1', targetId: 'u1', targetType: 'USER',
    dueDate: IN_10_DAYS, isMandatory: true,
  });
  h.userFindUnique.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@test.dev' });
  h.masterFindUnique.mockResolvedValue({ title: 'Fire Safety', description: 'Stay safe.' });
  h.courseFindUnique.mockResolvedValue(null);
});

describe('sendAssignmentAssignedEmail', () => {
  it('emails the learner that a course was assigned', async () => {
    const sent = await sendAssignmentAssignedEmail('a1');

    expect(sent).toBe(true);
    const mail = h.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('ada@test.dev');
    expect(mail.subject).toBe('New Training Assigned: Fire Safety');
    expect(mail.html).toContain('Hi Ada,');
    expect(mail.html).toContain('Fire Safety');
    expect(mail.html).toContain('NEW ASSIGNMENT');
    expect(mail.html).toContain('https://lms.test/login');
  });

  it('shows the due date and days remaining', async () => {
    const { html } = (await sendAssignmentAssignedEmail('a1'), h.sendEmail.mock.calls[0][0]);
    expect(html).toContain('Due date');
    expect(html).toContain('10 days');
  });

  it('marks a mandatory assignment', async () => {
    await sendAssignmentAssignedEmail('a1');
    expect(h.sendEmail.mock.calls[0][0].html).toContain('Mandatory');
  });

  it('marks an optional assignment', async () => {
    h.assignmentFindUnique.mockResolvedValue({ id: 'a1', courseId: 'c1', targetId: 'u1', dueDate: null, isMandatory: false });
    const { html } = (await sendAssignmentAssignedEmail('a1'), h.sendEmail.mock.calls[0][0]);
    expect(html).toContain('Optional');
    expect(html).toContain('Not set'); // no due date
  });

  it('falls back to the legacy Course when there is no MasterCourse', async () => {
    h.masterFindUnique.mockResolvedValue(null);
    h.courseFindUnique.mockResolvedValue({ title: 'Legacy Course', description: '' });
    await sendAssignmentAssignedEmail('a1');
    expect(h.sendEmail.mock.calls[0][0].subject).toBe('New Training Assigned: Legacy Course');
  });

  it('escapes HTML in the course title — a title cannot inject markup', async () => {
    h.masterFindUnique.mockResolvedValue({ title: '<script>alert(1)</script>', description: '' });
    const { html } = (await sendAssignmentAssignedEmail('a1'), h.sendEmail.mock.calls[0][0]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('skips silently when the assignment is gone', async () => {
    h.assignmentFindUnique.mockResolvedValue(null);
    expect(await sendAssignmentAssignedEmail('a1')).toBe(false);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('skips when the learner has no email on file', async () => {
    h.userFindUnique.mockResolvedValue({ firstName: 'Ada', lastName: 'L', email: null });
    expect(await sendAssignmentAssignedEmail('a1')).toBe(false);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('skips when the course cannot be found', async () => {
    h.masterFindUnique.mockResolvedValue(null);
    h.courseFindUnique.mockResolvedValue(null);
    expect(await sendAssignmentAssignedEmail('a1')).toBe(false);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('never throws — a mail failure must not fail the assignment', async () => {
    h.sendEmail.mockRejectedValue(new Error('SMTP down'));
    await expect(sendAssignmentAssignedEmail('a1')).resolves.toBe(false);
  });
});

describe('handleNewAssignments', () => {
  it('emails every newly created assignment', async () => {
    await handleNewAssignments(['a1', 'a2', 'a3']);
    expect(h.sendEmail).toHaveBeenCalledTimes(3);
  });

  it('one bad assignment does not stop the others', async () => {
    h.sendEmail.mockRejectedValueOnce(new Error('boom'));
    await expect(handleNewAssignments(['a1', 'a2'])).resolves.toBeUndefined();
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('sends nothing for an empty list', async () => {
    await handleNewAssignments([]);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});
