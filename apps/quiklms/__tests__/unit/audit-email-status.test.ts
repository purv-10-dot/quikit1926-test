/**
 * audit — two findings, both about the platform reporting work it never did.
 *
 * 1. `sendEmail` returned `void` and merely console.warn'd when no transport was
 *    configured, so `sendUpgradeInvoice` took the success path: the super admin
 *    was told "sent successfully" and the activity log recorded `emailStatus:
 *    'sent'` FOREVER, while the tenant received nothing. The legacy branched on
 *    a null return and recorded a failure (`audit.service.ts:396-422`).
 * 2. `messageId` was never captured, so the email-status panel's message-ID
 *    field was always empty and support could not correlate a complaint with the
 *    provider's send record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  tenantFindUnique: vi.fn(),
  activityCreate: vi.fn(),
  activityFindFirst: vi.fn(),
  tenantFindMany: vi.fn(),
  courseFindMany: vi.fn(),
  masterFindMany: vi.fn(),
  activityFindMany: vi.fn(),
  activityGroupBy: vi.fn(),
  emailTemplateFindUnique: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsTenant: { findUnique: h.tenantFindUnique, findMany: h.tenantFindMany },
    lmsActivityLog: {
      create: h.activityCreate,
      findFirst: h.activityFindFirst,
      findMany: h.activityFindMany,
      groupBy: h.activityGroupBy,
    },
    lmsCourse: { findMany: h.courseFindMany },
    lmsMasterCourse: { findMany: h.masterFindMany },
    lmsEmailTemplate: { findUnique: h.emailTemplateFindUnique },
  },
}));

import { sendUpgradeInvoice, getEmailDeliveryStatus } from '@/lib/services/audit-service';

const TENANT = { id: 'org-1', orgName: 'Acme', officialEmail: 'billing@acme.test', contactEmail: 'c@acme.test' };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.tenantFindUnique.mockResolvedValue(TENANT);
  h.tenantFindMany.mockResolvedValue([TENANT]);
  h.courseFindMany.mockResolvedValue([]);
  h.masterFindMany.mockResolvedValue([]);
  h.activityFindMany.mockResolvedValue([]);
  h.activityGroupBy.mockResolvedValue([]);
  h.activityCreate.mockResolvedValue({});
  h.emailTemplateFindUnique.mockResolvedValue(null);
  h.sendEmail.mockResolvedValue({ messageId: '<abc@smtp>' });
});

const logOf = () => h.activityCreate.mock.calls[0][0].data;

describe('sendUpgradeInvoice — never claim an email was sent when it was not', () => {
  it('records failure when NO mail transport is configured', async () => {
    h.sendEmail.mockResolvedValue(null); // lib/email returns null = not sent

    const out = await sendUpgradeInvoice('org-1');

    expect(out.success).toBe(false);
    expect(out.error).toBe('Email service not configured (SMTP credentials missing)');
    expect(logOf().metadata.emailStatus).toBe('failed');
    expect(logOf().metadata.error).toBe('Email service not configured (SMTP credentials missing)');
  });

  it('records success — and the messageId — on a real send', async () => {
    const out = await sendUpgradeInvoice('org-1');

    expect(out.success).toBe(true);
    expect(logOf().metadata.emailStatus).toBe('sent');
    // Support needs this to correlate a complaint with the provider's record.
    expect(logOf().metadata.messageId).toBe('<abc@smtp>');
    expect(out.messageId).toBe('<abc@smtp>');
  });

  it('records failure when the transport throws', async () => {
    h.sendEmail.mockRejectedValue(new Error('SMTP 550'));
    const out = await sendUpgradeInvoice('org-1');
    expect(out.success).toBe(false);
    expect(logOf().metadata.emailStatus).toBe('failed');
    expect(logOf().metadata.error).toBe('SMTP 550');
  });

  it('prefers the official billing email', async () => {
    await sendUpgradeInvoice('org-1');
    expect(h.sendEmail.mock.calls[0][0].to).toBe('billing@acme.test');
  });
});

describe('getEmailDeliveryStatus — status must not depend on log volume', () => {
  it('queries the newest log that actually has emailStatus, in the DB', async () => {
    h.activityFindFirst.mockResolvedValue({
      timestamp: new Date('2026-03-01T00:00:00Z'),
      metadata: { emailStatus: 'sent', messageId: '<abc@smtp>' },
    });

    const out = await getEmailDeliveryStatus('org-1');

    // The old code fetched the latest 50 and filtered in JS, so 50 newer
    // unrelated user_action logs made the status silently vanish.
    const call = h.activityFindFirst.mock.calls[0][0];
    expect(call.where.orgId).toBe('org-1');
    expect(call.where.NOT).toBeDefined(); // emailStatus presence pushed into the query
    expect(call.orderBy).toEqual({ timestamp: 'desc' });

    expect(out.deliveryStatus).toBe('pending');
    expect(out.messageId).toBe('<abc@smtp>');
  });

  it('reports failed when the last attempt failed', async () => {
    h.activityFindFirst.mockResolvedValue({ timestamp: new Date(), metadata: { emailStatus: 'failed', error: 'nope' } });
    const out = await getEmailDeliveryStatus('org-1');
    expect(out.deliveryStatus).toBe('failed');
    expect(out.error).toBe('nope');
  });

  it('reports unknown when nothing was ever sent', async () => {
    h.activityFindFirst.mockResolvedValue(null);
    expect(await getEmailDeliveryStatus('org-1')).toEqual({ deliveryStatus: 'unknown' });
  });
});
