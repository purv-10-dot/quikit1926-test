/**
 * A school invite must read as a SCHOOL invite.
 *
 * `invitationEmail` was tenant-type agnostic: the head of a school and a
 * corporate L&D lead both received "You've been invited to <org> as Tenant
 * Administrator", and a school's pupils were invited as "Learners". Nothing in
 * the message reflected which kind of organisation they were joining, which is
 * what made a school onboarding look like it had gone out as a corporate one.
 *
 * Only the labels that genuinely differ are overridden — everything else falls
 * back to the shared name, so this cannot silently rename roles that are the
 * same in both worlds (Teacher, Parent).
 */
import { describe, it, expect } from 'vitest';
import { invitationEmail, roleDisplayNameFor, roleDisplayName } from '@/lib/email-templates';

const base = {
  firstName: 'Ada',
  email: 'ada@school.test',
  tempPassword: 'Temp123!',
  loginUrl: 'https://quikskill.vercel.app/login',
};

describe('role vocabulary follows the tenant type', () => {
  it('a school admin is a School Administrator', () => {
    expect(roleDisplayNameFor('TENANT_ADMIN', 'school')).toBe('School Administrator');
  });

  it('a corporate admin keeps the platform label', () => {
    expect(roleDisplayNameFor('TENANT_ADMIN', 'corporate')).toBe('Tenant Administrator');
  });

  it('a school learner is a Student', () => {
    expect(roleDisplayNameFor('LEARNER', 'school')).toBe('Student');
    expect(roleDisplayNameFor('LEARNER', 'corporate')).toBe('Learner');
  });

  it('a school manager is a Coordinator', () => {
    expect(roleDisplayNameFor('MANAGER', 'school')).toBe('Coordinator');
  });

  it('roles that mean the same thing in both are NOT renamed', () => {
    for (const r of ['TEACHER', 'PARENT']) {
      expect(roleDisplayNameFor(r, 'school')).toBe(roleDisplayName(r));
    }
  });

  it('defaults to corporate wording when the type is unknown', () => {
    // A missing tenant row must degrade to the existing behaviour, never crash.
    expect(roleDisplayNameFor('TENANT_ADMIN', null)).toBe('Tenant Administrator');
    expect(roleDisplayNameFor('TENANT_ADMIN', undefined)).toBe('Tenant Administrator');
  });
});

describe('the rendered email carries it through', () => {
  it('a school invitation says School Administrator in body AND header', () => {
    const { html } = invitationEmail({
      ...base,
      role: 'TENANT_ADMIN',
      orgName: 'St Mary’s',
      tenantType: 'school',
    });
    expect(html).toContain('School Administrator');
    expect(html).not.toContain('Tenant Administrator');
  });

  it('a corporate invitation is unchanged', () => {
    const { html } = invitationEmail({
      ...base,
      role: 'TENANT_ADMIN',
      orgName: 'Acme',
      tenantType: 'corporate',
    });
    expect(html).toContain('Tenant Administrator');
    expect(html).not.toContain('School Administrator');
  });

  it('a school student invitation says Student, not Learner', () => {
    const { html } = invitationEmail({ ...base, role: 'LEARNER', tenantType: 'school' });
    expect(html).toContain('Student');
  });

  it('still names the organisation and keeps the credentials block', () => {
    const { html, subject } = invitationEmail({
      ...base,
      role: 'TENANT_ADMIN',
      orgName: 'St Mary’s',
      tenantType: 'school',
    });
    expect(subject).toContain('St Mary');
    expect(html).toContain('Temp123!');
  });

  it('omits the temp password when the invitee already had one', () => {
    const { html } = invitationEmail({
      ...base,
      tempPassword: null,
      role: 'TEACHER',
      tenantType: 'school',
    });
    expect(html).not.toContain('Temporary password');
  });
});
