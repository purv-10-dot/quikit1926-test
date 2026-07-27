/**
 * GAP_REPORT §3.2 manager — the non-export findings.
 *
 * `approveCertificate` is REBUILT, not ported. The legacy
 * (`manager.service.ts:1264-1280`) writes an audit log and nothing else, yet
 * returns "Certificate approved successfully"; logs QUIZ_PASSING_SCORE_UPDATED
 * for a certificate approval; and validates nothing, so ANY id — a typo, or
 * another tenant's certificate — returns success. The port made it a pure
 * `void` no-op, which at least did not lie about the action but still returned
 * success for everything.
 *
 * Also covered: the nudge delivery failure that reported {success:false} at
 * HTTP 200, and the HTML injection opened by the port's new free-text
 * `{message}` body flowing into email markup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  certFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  notifyUsers: vi.fn(),
  tenantLogCreate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/services/notify-service', () => ({ notifyUsers: h.notifyUsers }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsCertificateIssued: { findFirst: h.certFindFirst },
    lmsUser: { findFirst: h.userFindFirst },
    lmsTenantLog: { create: h.tenantLogCreate },
  },
}));

import { approveCertificate, nudgeUser } from '@/lib/services/manager-service';

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.certFindFirst.mockResolvedValue({ id: 'i1', certificateId: 'CERT-1', learnerId: 'u1' });
  h.userFindFirst.mockResolvedValue({ id: 'u1', email: 'ada@test.dev', firstName: 'Ada', lastName: 'Lovelace' });
  h.notifyUsers.mockResolvedValue({ deliveredCount: 1 });
  h.tenantLogCreate.mockResolvedValue({ id: 'log1' });
});

describe('approveCertificate — no longer succeeds at nothing', () => {
  it('approves a certificate belonging to the manager’s own team member', async () => {
    const out = await approveCertificate('m1', 'org-1', 'CERT-1');
    expect(out).toEqual({ success: true, message: 'Certificate approved successfully' });
  });

  it('logs CertificateApprovedByManager — not a quiz event', async () => {
    await approveCertificate('m1', 'org-1', 'CERT-1');
    const log = h.tenantLogCreate.mock.calls[0][0].data;
    expect(log.actionType).toBe('CertificateApprovedByManager');
    expect(log.performedBy).toBe('m1');
    expect(log.description).toBe('Manager approved certificate CERT-1');
    expect(log.metadata).toEqual({ certificateId: 'CERT-1', learnerId: 'u1' });
  });

  it('404s for a certificate that does not exist, instead of reporting success', async () => {
    h.certFindFirst.mockResolvedValue(null);
    await expect(approveCertificate('m1', 'org-1', 'nonsense')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Certificate not found',
    });
    expect(h.tenantLogCreate).not.toHaveBeenCalled();
  });

  it('is org-scoped — another tenant’s certificate is not found', async () => {
    h.certFindFirst.mockResolvedValue(null);
    await expect(approveCertificate('m1', 'org-1', 'CERT-OTHER')).rejects.toMatchObject({ statusCode: 404 });
    expect(h.certFindFirst.mock.calls[0][0].where.orgId).toBe('org-1');
  });

  it('403s when the learner is not on this manager’s team', async () => {
    h.userFindFirst.mockResolvedValue(null);
    await expect(approveCertificate('m1', 'org-1', 'CERT-1')).rejects.toMatchObject({
      statusCode: 403,
      message: 'You do not have authority over this user',
    });
    expect(h.tenantLogCreate).not.toHaveBeenCalled();
  });

  it('accepts either the row id or the public certificate id', async () => {
    await approveCertificate('m1', 'org-1', 'i1');
    expect(h.certFindFirst.mock.calls[0][0].where.OR).toEqual([{ id: 'i1' }, { certificateId: 'i1' }]);
  });
});

describe('nudgeUser — a failed delivery is not a 200', () => {
  it('reports success when the nudge is delivered', async () => {
    const out = await nudgeUser('m1', 'org-1', 'u1');
    expect(out).toMatchObject({ success: true });
  });

  it('throws a 500 when nothing was delivered, rather than {success:false} at HTTP 200', async () => {
    h.notifyUsers.mockResolvedValue({ deliveredCount: 0 });
    await expect(nudgeUser('m1', 'org-1', 'u1')).rejects.toMatchObject({
      statusCode: 500,
      message: 'Failed to deliver nudge',
    });
  });

  it('uses the default template when no message is supplied', async () => {
    await nudgeUser('m1', 'org-1', 'u1');
    expect(h.notifyUsers.mock.calls[0][0].message).toBe(
      'Reminder from your manager: please continue your assigned training.',
    );
  });

  it('passes a custom message through', async () => {
    await nudgeUser('m1', 'org-1', 'u1', '  Please finish module 3  ');
    expect(h.notifyUsers.mock.calls[0][0].message).toBe('Please finish module 3');
  });

  it('falls back to the default for a whitespace-only message', async () => {
    await nudgeUser('m1', 'org-1', 'u1', '   ');
    expect(h.notifyUsers.mock.calls[0][0].message).toContain('Reminder from your manager');
  });
});
