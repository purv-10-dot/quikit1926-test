/**
 * HTML injection into notification emails.
 *
 * The port added a free-text `{message}` body to the manager nudge endpoints —
 * the legacy's nudge body was a fixed template with no user input at all
 * (GAP_REPORT §3.2 manager: "a new input surface"). That text was interpolated
 * raw into the email markup:
 *
 *     html: `<p>Hi ${r.firstName} ${r.lastName},</p><p>${message}</p>`
 *
 * so a manager could inject arbitrary HTML — including a link — into an email
 * the platform sends under its own name. Every caller passes plain text, so
 * escaping costs nothing and closes it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  convFindMany: vi.fn(),
  convCreate: vi.fn(),
  convUpdate: vi.fn(),
  msgCreate: vi.fn(),
  participantUpdateMany: vi.fn(),
  tenantLogCreate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/email', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsConversation: { findMany: h.convFindMany, create: h.convCreate, update: h.convUpdate },
    lmsConversationParticipant: { updateMany: h.participantUpdateMany },
    lmsMessage: { create: h.msgCreate },
    lmsTenantLog: { create: h.tenantLogCreate },
  },
}));

import { notifyUsers } from '@/lib/services/notify-service';

const recipient = { id: 'u1', email: 'ada@test.dev', firstName: 'Ada', lastName: 'Lovelace' };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  // An existing 2-participant direct conversation — the delivery path's happy case.
  h.convFindMany.mockResolvedValue([{ id: 'conv1', participants: [{ userId: 'm1' }, { userId: 'u1' }] }]);
  h.participantUpdateMany.mockResolvedValue({ count: 2 });
  h.msgCreate.mockResolvedValue({ id: 'm1' });
  h.convUpdate.mockResolvedValue({});
  h.tenantLogCreate.mockResolvedValue({});
});

const notify = (message: string) =>
  notifyUsers({ orgId: 'org-1', senderId: 'm1', recipients: [recipient], message, subject: 'A reminder' });

describe('notifyUsers — email body escaping', () => {
  it('escapes HTML in a manager-supplied message', async () => {
    await notify('<img src=x onerror=alert(1)>');
    const { html } = h.sendEmail.mock.calls[0][0];
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('a manager cannot smuggle a link into a platform email', async () => {
    await notify('Click <a href="https://evil.test">here</a> to verify your account');
    const { html } = h.sendEmail.mock.calls[0][0];
    expect(html).not.toContain('<a href="https://evil.test">');
    expect(html).toContain('&lt;a href=&quot;https://evil.test&quot;&gt;');
  });

  it('escapes the recipient name too — it is stored data, not a constant', async () => {
    await notifyUsers({
      orgId: 'org-1',
      senderId: 'm1',
      recipients: [{ ...recipient, firstName: '<script>x</script>' }],
      message: 'hi',
      subject: 'A reminder',
    });
    const { html } = h.sendEmail.mock.calls[0][0];
    expect(html).not.toContain('<script>x</script>');
  });

  it('leaves ordinary text readable — escaping must not mangle normal nudges', async () => {
    await notify('Please finish module 3 before Friday.');
    const { html } = h.sendEmail.mock.calls[0][0];
    expect(html).toContain('<p>Please finish module 3 before Friday.</p>');
    expect(html).toContain('<p>Hi Ada Lovelace,</p>');
  });

  it("escapes an ampersand without double-escaping the platform's own link", async () => {
    await notify('Q&A session');
    const { html } = h.sendEmail.mock.calls[0][0];
    expect(html).toContain('Q&amp;A session');
    expect(html).toContain('Open QuikSkill');
  });
});
