/**
 * Three IDORs that predate the migration (all faithful ports of legacy holes),
 * closed 2026-07-18 on the same reasoning as the exam answer-key leak: a
 * pre-existing hole should not survive the migration just because it predates it.
 *
 *  1. `GET /credits/my-transactions` — any PARENT could pass any `studentId` and
 *     read that student's full credit purchase and spend history.
 *  2. `GET /analytics/student/:id` — any PARENT or TEACHER in the org could pull
 *     any student's attendance calendar, homework scores and progress.
 *  3. `POST /proctoring/:sessionId/event` — any learner could log cheating
 *     events against ANOTHER learner's session, inflating their flag count and
 *     severity. Not a leak: framing a classmate for cheating.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  userHasRole: vi.fn(),
  parentFindUnique: vi.fn(),
  batchStudentFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  sessionFindFirst: vi.fn(),
  logCount: vi.fn(),
  logCreate: vi.fn(),
  getTransactions: vi.fn(),
  getStudentProgress: vi.fn(),
  incrementFlags: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  requireRoles: h.requireRoles,
  userHasRole: h.userHasRole,
}));
vi.mock('@/lib/services/credits-service', () => ({ getTransactions: h.getTransactions }));
vi.mock('@/lib/services/analytics-service', () => ({ getStudentProgress: h.getStudentProgress }));
vi.mock('@/lib/services/proctoring-flags', () => ({ incrementProctoringFlags: h.incrementFlags }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsUserParent: { findUnique: h.parentFindUnique },
    lmsBatchStudent: { findFirst: h.batchStudentFindFirst },
    lmsUser: { findFirst: h.userFindFirst },
    lmsExamSession: { findFirst: h.sessionFindFirst },
    lmsProctoringLog: { count: h.logCount, create: h.logCreate },
  },
}));

import { GET as creditsGET } from '@/app/api/credits/my-transactions/route';
import { GET as analyticsGET } from '@/app/api/analytics/student/[studentId]/route';
import { logEvent } from '@/lib/services/proctoring-service';

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireRoles.mockReturnValue(undefined);
  h.userHasRole.mockImplementation((u: { role: string }, r: string) => u.role === r);
  h.getTransactions.mockResolvedValue({ transactions: [] });
  h.getStudentProgress.mockResolvedValue({ ok: true });
  h.parentFindUnique.mockResolvedValue(null);
  h.batchStudentFindFirst.mockResolvedValue(null);
  h.userFindFirst.mockResolvedValue(null);
  h.logCount.mockResolvedValue(0);
  h.logCreate.mockResolvedValue({ id: 'l1', severity: 'low' });
  h.sessionFindFirst.mockResolvedValue({ id: 's1' });
});

describe('1. credit transactions — a PARENT sees only their own child', () => {
  const req = (studentId?: string) =>
    new Request(`http://x/api/credits/my-transactions${studentId ? `?studentId=${studentId}` : ''}`) as never;

  it('allows a linked child', async () => {
    h.requireAuth.mockResolvedValue({ id: 'p1', role: 'PARENT', orgId: 'org-1' });
    h.parentFindUnique.mockResolvedValue({ id: 'link1' });
    const res = await creditsGET(req('kid1'), {});
    expect(res.status).toBe(200);
    expect(h.getTransactions).toHaveBeenCalledWith('org-1', 'kid1', 1, 20);
  });

  it('403s an UNLINKED student — the IDOR', async () => {
    h.requireAuth.mockResolvedValue({ id: 'p1', role: 'PARENT', orgId: 'org-1' });
    h.parentFindUnique.mockResolvedValue(null);
    const res = await creditsGET(req('someone-elses-kid'), {});
    expect(res.status).toBe(403);
    expect(h.getTransactions).not.toHaveBeenCalled();
  });

  it('a LEARNER always reads their own, ignoring any supplied id', async () => {
    h.requireAuth.mockResolvedValue({ id: 'u1', role: 'LEARNER', orgId: 'org-1' });
    await creditsGET(req('victim'), {});
    expect(h.getTransactions).toHaveBeenCalledWith('org-1', 'u1', 1, 20);
  });
});

describe('2. student analytics — relationship required', () => {
  const req = () => new Request('http://x/api/analytics/student/kid1') as never;
  const ctx = { params: { studentId: 'kid1' } };

  it('an admin may view any student in their org', async () => {
    h.requireAuth.mockResolvedValue({ id: 'a1', role: 'TENANT_ADMIN', orgId: 'org-1' });
    expect((await analyticsGET(req(), ctx)).status).toBe(200);
  });

  it('a linked PARENT may view their child', async () => {
    h.requireAuth.mockResolvedValue({ id: 'p1', role: 'PARENT', orgId: 'org-1' });
    h.parentFindUnique.mockResolvedValue({ id: 'link1' });
    expect((await analyticsGET(req(), ctx)).status).toBe(200);
  });

  it('403s an UNLINKED parent', async () => {
    h.requireAuth.mockResolvedValue({ id: 'p1', role: 'PARENT', orgId: 'org-1' });
    const res = await analyticsGET(req(), ctx);
    expect(res.status).toBe(403);
    expect(h.getStudentProgress).not.toHaveBeenCalled();
  });

  it('a TEACHER who shares a batch may view the student', async () => {
    h.requireAuth.mockResolvedValue({ id: 't1', role: 'TEACHER', orgId: 'org-1' });
    h.batchStudentFindFirst.mockResolvedValue({ id: 'bs1' });
    expect((await analyticsGET(req(), ctx)).status).toBe(200);
  });

  it('403s a TEACHER with no connection to the student', async () => {
    h.requireAuth.mockResolvedValue({ id: 't1', role: 'TEACHER', orgId: 'org-1' });
    expect((await analyticsGET(req(), ctx)).status).toBe(403);
  });

  it('anyone may read their OWN record', async () => {
    h.requireAuth.mockResolvedValue({ id: 'kid1', role: 'LEARNER', orgId: 'org-1' });
    expect((await analyticsGET(req(), ctx)).status).toBe(200);
  });
});

describe('3. proctoring events — cannot be logged against a classmate', () => {
  const actor = { id: 'u1', orgId: 'org-1', role: 'LEARNER' } as never;

  it('records an event on the caller’s own session', async () => {
    h.sessionFindFirst.mockResolvedValue({ id: 's1' });
    const out = await logEvent(actor, 'u1', 's1', 'tab_switch');
    expect(out.severity).toBe('low');
    expect(h.logCreate).toHaveBeenCalled();
  });

  it('404s a session belonging to another learner — the framing vector', async () => {
    h.sessionFindFirst.mockResolvedValue(null);
    await expect(logEvent(actor, 'u1', 'victims-session', 'tab_switch')).rejects.toMatchObject({ statusCode: 404 });
    expect(h.logCreate).not.toHaveBeenCalled();
    expect(h.incrementFlags).not.toHaveBeenCalled();
  });

  it('scopes the ownership check by org AND student', async () => {
    await logEvent(actor, 'u1', 's1', 'tab_switch');
    expect(h.sessionFindFirst.mock.calls[0][0].where).toMatchObject({
      id: 's1', orgId: 'org-1', studentId: 'u1',
    });
  });
});
