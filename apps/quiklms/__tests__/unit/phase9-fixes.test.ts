/**
 * Phase 9 — items wrongly deferred to a worker that never implemented them,
 * plus data-safety fixes.
 *
 *  - escalations were never resolved: nothing anywhere wrote `resolutionTime` /
 *    `teacherJoinedAt`, so rows stayed pending forever even after the teacher
 *    joined. It needs no worker — starting the class IS the resolution event.
 *  - attendance never refreshed payout drafts: the worker has no payout job at
 *    all, so `/api/payouts` showed nothing until an admin manually generated.
 *  - batches: permanent delete cascade-wiped a term of academic history where
 *    Mongo left orphans.
 *  - credits: refunds had no upper bound — free credits from a typo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  classFindUnique: vi.fn(),
  classUpdate: vi.fn(),
  escalationUpdateMany: vi.fn(),
  userUpdate: vi.fn(),
  userFindMany: vi.fn(),
  batchFindMany: vi.fn(),
  batchFindUnique: vi.fn(),
  batchDelete: vi.fn(),
  countClasses: vi.fn(),
  countHomework: vi.fn(),
  countGrades: vi.fn(),
  countAttendance: vi.fn(),
  pkgFindFirst: vi.fn(),
  pkgUpdate: vi.fn(),
  txCreate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/services/payouts-service', () => ({ generatePayouts: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsScheduledClass: { findUnique: h.classFindUnique, update: h.classUpdate, count: h.countClasses, findMany: vi.fn() },
    lmsCallEscalation: { updateMany: h.escalationUpdateMany },
    lmsUser: { update: h.userUpdate, findMany: h.userFindMany, findUnique: vi.fn() },
    lmsBatch: { findMany: h.batchFindMany, findUnique: h.batchFindUnique, delete: h.batchDelete },
    lmsHomework: { count: h.countHomework },
    lmsGradeRecord: { count: h.countGrades },
    lmsAttendance: { count: h.countAttendance },
    lmsCreditPackage: { findFirst: h.pkgFindFirst, update: h.pkgUpdate },
    lmsCreditTransaction: { create: h.txCreate },
    lmsMeetingAttendance: { findMany: vi.fn() },
  },
}));

import { startClass } from '@/lib/services/scheduling-service';
import { remove as removeBatch } from '@/lib/services/batches-service';
import { refundCredits } from '@/lib/services/credits-service';

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.classFindUnique.mockResolvedValue({ id: 'c1', orgId: 'org-1', status: 'scheduled', teacherId: 't1', startTime: new Date(), batchId: 'b1' });
  h.classUpdate.mockImplementation(async ({ data }: any) => ({
    id: 'c1', orgId: 'org-1', teacherId: 't1', batchId: 'b1', startTime: new Date(), ...data,
  }));
  h.escalationUpdateMany.mockResolvedValue({ count: 1 });
  h.userUpdate.mockResolvedValue({});
  h.userFindMany.mockResolvedValue([]);
  h.batchFindMany.mockResolvedValue([]);
  [h.countClasses, h.countHomework, h.countGrades, h.countAttendance].forEach((f) => f.mockResolvedValue(0));
});

describe('startClass resolves the open escalation', () => {
  it('marks pending/escalating rows resolved and stamps the join time', async () => {
    await startClass('org-1', 'c1');
    expect(h.escalationUpdateMany).toHaveBeenCalledTimes(1);
    const call = h.escalationUpdateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      orgId: 'org-1',
      scheduledClassId: 'c1',
      status: { in: ['pending', 'escalating'] },
    });
    expect(call.data.status).toBe('resolved');
    expect(call.data.resolutionTime).toBeInstanceOf(Date);
    expect(call.data.teacherJoinedAt).toBeInstanceOf(Date);
  });

  it('never fails starting a class over escalation bookkeeping', async () => {
    h.escalationUpdateMany.mockRejectedValue(new Error('escalation table down'));
    await expect(startClass('org-1', 'c1')).resolves.toBeDefined();
  });

  it('does not touch escalations when the class cannot start', async () => {
    h.classFindUnique.mockResolvedValue({ id: 'c1', orgId: 'org-1', status: 'completed' });
    await expect(startClass('org-1', 'c1')).rejects.toMatchObject({ statusCode: 400 });
    expect(h.escalationUpdateMany).not.toHaveBeenCalled();
  });
});

describe('permanent batch delete refuses to destroy academic history', () => {
  beforeEach(() => {
    h.batchFindUnique.mockResolvedValue({ id: 'b1', orgId: 'org-1', status: 'archived' });
  });

  it('deletes a genuinely empty archived batch', async () => {
    await removeBatch('org-1', 'b1');
    expect(h.batchDelete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });

  it('refuses when grades exist, and says so', async () => {
    h.countGrades.mockResolvedValue(23);
    await expect(removeBatch('org-1', 'b1')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('23 grade record(s)'),
    });
    expect(h.batchDelete).not.toHaveBeenCalled();
  });

  it('lists every blocking record type', async () => {
    h.countClasses.mockResolvedValue(10);
    h.countAttendance.mockResolvedValue(40);
    await expect(removeBatch('org-1', 'b1')).rejects.toMatchObject({
      message: expect.stringContaining('10 scheduled class(es), 40 attendance record(s)'),
    });
  });

  it('still refuses to delete an ACTIVE batch outright', async () => {
    h.batchFindUnique.mockResolvedValue({ id: 'b1', orgId: 'org-1', status: 'active' });
    await expect(removeBatch('org-1', 'b1')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('refundCredits is bounded', () => {
  beforeEach(() => {
    h.pkgFindFirst.mockResolvedValue({ id: 'p1', orgId: 'org-1', usedCredits: 10, remainingCredits: 5, status: 'active' });
    h.pkgUpdate.mockResolvedValue({});
    h.txCreate.mockResolvedValue({});
  });

  it('allows a refund up to the used amount', async () => {
    await refundCredits('org-1', { packageId: 'p1', amount: 10, reason: 'goodwill' }, 'admin1');
    expect(h.pkgUpdate.mock.calls[0][0].data).toMatchObject({ usedCredits: 0, remainingCredits: 15 });
  });

  it('rejects a refund larger than what was used — no free credits from a typo', async () => {
    await expect(
      refundCredits('org-1', { packageId: 'p1', amount: 1000, reason: 'oops' }, 'admin1'),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(h.pkgUpdate).not.toHaveBeenCalled();
  });

  it('rejects a zero or negative refund', async () => {
    await expect(
      refundCredits('org-1', { packageId: 'p1', amount: 0, reason: 'x' }, 'admin1'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
