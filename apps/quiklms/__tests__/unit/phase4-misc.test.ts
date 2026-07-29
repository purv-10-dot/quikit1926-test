/**
 * Phase 4/5 fixes across payouts, exam-sessions and tutoring-requests.
 *
 *  - payouts: a teacher with no level row was paid `baseRate` instead of the
 *    configured `beginnerRate` (the legacy auto-created the row, defaulting to
 *    BEGINNER), and `addAdjustment` wrote the row and the totals separately so a
 *    failure left the payable amount stale. Both are money.
 *  - exam-sessions: `.populate()` replace-semantics lost, plus NULLS-FIRST
 *    ordering putting ungraded submissions at the top of the ranked table.
 *  - tutoring-requests: accepting a request skipped the double-booking check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  // payouts
  levelFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  adjCreate: vi.fn(),
  adjFindMany: vi.fn(),
  payoutFindFirst: vi.fn(),
  payoutFindUnique: vi.fn(),
  payoutUpdate: vi.fn(),
  transaction: vi.fn(),
  // exam-sessions
  sessionFindMany: vi.fn(),
  sessionFindFirst: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/auth/context', () => ({
  tenantWhere: (_u: unknown, w: object) => ({ ...w, orgId: 'org-1' }),
  assertTenantMatch: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    lmsTeacherLevel: { findFirst: h.levelFindFirst },
    lmsTenant: { findUnique: h.tenantFindUnique },
    lmsPayoutAdjustment: { create: h.adjCreate, findMany: h.adjFindMany },
    lmsTeacherPayout: { findFirst: h.payoutFindFirst, findUnique: h.payoutFindUnique, update: h.payoutUpdate },
    lmsExamSession: { findMany: h.sessionFindMany, findFirst: h.sessionFindFirst },
    lmsUser: { findMany: h.userFindMany },
    $transaction: h.transaction,
  },
}));

import { getSubmissions } from '@/lib/services/exam-sessions-service';
import { getTeacherRateByLevel } from '@/lib/services/payouts-service';

const USER = { id: 'u1', role: 'TENANT_ADMIN', orgId: 'org-1' } as never;

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.userFindMany.mockResolvedValue([]);
  h.sessionFindMany.mockResolvedValue([]);
});

describe('exam-sessions — the teacher evaluation screen works again', () => {
  it('orders by score desc with NULLS LAST so ungraded work sinks', async () => {
    await getSubmissions(USER, 'e1');
    expect(h.sessionFindMany.mock.calls[0][0].orderBy).toEqual({
      score: { sort: 'desc', nulls: 'last' },
    });
  });

  it('exposes _id — the page builds its grade/void URLs from it', async () => {
    h.sessionFindMany.mockResolvedValue([{ id: 's1', studentId: 'stu1', score: 90 }]);
    h.userFindMany.mockResolvedValue([
      { id: 'stu1', firstName: 'Ada', lastName: 'L', email: 'a@b.test', studentId: 'S1', grade: '10' },
    ]);
    const [row] = await getSubmissions(USER, 'e1');
    // Without _id every action POSTed to /undefined and 404'd.
    expect(row._id).toBe('s1');
  });

  it('replaces studentId with the populated student, so the Student column renders', async () => {
    h.sessionFindMany.mockResolvedValue([{ id: 's1', studentId: 'stu1', score: 90 }]);
    h.userFindMany.mockResolvedValue([
      { id: 'stu1', firstName: 'Ada', lastName: 'L', email: 'a@b.test', studentId: 'S1', grade: '10' },
    ]);
    const [row] = await getSubmissions(USER, 'e1');
    expect(row.studentId).toMatchObject({ _id: 'stu1', firstName: 'Ada', lastName: 'L' });
  });

  it('leaves studentId a raw id when the user row is gone', async () => {
    h.sessionFindMany.mockResolvedValue([{ id: 's1', studentId: 'ghost', score: null }]);
    h.userFindMany.mockResolvedValue([]);
    const [row] = await getSubmissions(USER, 'e1');
    expect(row.studentId).toBe('ghost');
  });
});

describe('payouts — teacher level rate ladder', () => {
  const CONFIG = { enhancementConfig: { teacherLevel: { beginnerRate: 300, intermediateRate: 500, leadRate: 800 } } };

  it('pays beginnerRate when the teacher has NO level row', async () => {
    // The legacy resolved levels through getTeacherLevel, which AUTO-CREATED the
    // row defaulting to BEGINNER, so an unrated teacher was paid beginnerRate.
    // Returning baseRate here systematically over/under-paid every new teacher.
    h.levelFindFirst.mockResolvedValue(null);
    h.tenantFindUnique.mockResolvedValue(CONFIG);
    expect(await getTeacherRateByLevel('org-1', 't1', 999)).toBe(300);
  });

  it('pays the level rate when a row exists', async () => {
    h.levelFindFirst.mockResolvedValue({ currentLevel: 'lead' });
    h.tenantFindUnique.mockResolvedValue(CONFIG);
    expect(await getTeacherRateByLevel('org-1', 't1', 999)).toBe(800);
  });

  it('falls back to baseRate when the tenant has no level config at all', async () => {
    h.levelFindFirst.mockResolvedValue(null);
    h.tenantFindUnique.mockResolvedValue({ enhancementConfig: {} });
    expect(await getTeacherRateByLevel('org-1', 't1', 999)).toBe(999);
  });

  it('falls back to baseRate when the configured rate for that level is missing', async () => {
    h.levelFindFirst.mockResolvedValue({ currentLevel: 'intermediate' });
    h.tenantFindUnique.mockResolvedValue({ enhancementConfig: { teacherLevel: { beginnerRate: 300 } } });
    expect(await getTeacherRateByLevel('org-1', 't1', 999)).toBe(999);
  });
});
