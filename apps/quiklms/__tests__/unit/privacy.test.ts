/**
 * GAP_REPORT §2.4 — the TeacherPrivacyInterceptor was not migrated.
 *
 * `LIST_SELECT` (`users-service.ts`) explicitly selects `email` and `phone`, and
 * `POST /users/by-ids` permits TEACHER — so teachers received student contact
 * details the original stripped, with no audit trail. The `LmsPrivacyAuditLog`
 * table existed and was back-filled by the ETL, but nothing wrote it at request
 * time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ auditCreate: vi.fn() }));

vi.mock('@/lib/db', () => ({ db: { lmsPrivacyAuditLog: { create: h.auditCreate } } }));

import { stripSensitiveFields, applyTeacherPrivacy } from '@/lib/privacy';

const student = {
  id: 's1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'LEARNER',
  grade: '10',
  email: 'ada@school.test',
  phone: '+15550001',
  dateOfBirth: '2010-01-01',
  guardianContact: '+15550002',
  guardianRelation: 'mother',
  parentIds: ['p1'],
  aiApiKey: 'sk-secret',
  provider: 'google',
  providerId: 'g-1',
};

const teacher = { id: 'u-t', role: 'TEACHER', orgId: 'org-1', isActive: true } as never;
const admin = { id: 'u-a', role: 'TENANT_ADMIN', orgId: 'org-1', isActive: true } as never;

function req(url = 'http://x/api/users?role=LEARNER') {
  return new Request(url, { headers: { 'user-agent': 'jest', 'x-forwarded-for': '203.0.113.9' } }) as never;
}

beforeEach(() => {
  h.auditCreate.mockReset();
  h.auditCreate.mockResolvedValue({});
});

describe('stripSensitiveFields', () => {
  it('removes every sensitive field and reports which were present', () => {
    const { cleaned, strippedFields } = stripSensitiveFields(student);
    for (const f of [
      'email', 'phone', 'dateOfBirth', 'guardianContact', 'guardianRelation',
      'parentIds', 'aiApiKey', 'provider', 'providerId',
    ]) {
      expect(cleaned, `${f} must be stripped`).not.toHaveProperty(f);
      expect(strippedFields).toContain(f);
    }
  });

  it('keeps the fields a teacher legitimately needs', () => {
    const { cleaned } = stripSensitiveFields(student);
    expect(cleaned).toMatchObject({ id: 's1', firstName: 'Ada', lastName: 'Lovelace', role: 'LEARNER', grade: '10' });
  });

  it('only reports fields that were actually present', () => {
    const { strippedFields } = stripSensitiveFields({ id: 's1', email: 'a@b.c' });
    expect(strippedFields).toEqual(['email']);
  });

  it('ignores a present-but-undefined field, matching the legacy guard', () => {
    const { strippedFields } = stripSensitiveFields({ id: 's1', email: undefined });
    expect(strippedFields).toEqual([]);
  });

  it('handles arrays and de-duplicates the reported fields', () => {
    const { cleaned, strippedFields } = stripSensitiveFields([student, student]);
    expect((cleaned as any[]).every((c) => !('email' in c))).toBe(true);
    expect(strippedFields.filter((f) => f === 'email')).toHaveLength(1);
  });

  it('passes through non-objects untouched', () => {
    expect(stripSensitiveFields(null).cleaned).toBeNull();
    expect(stripSensitiveFields('x').cleaned).toBe('x');
  });

  it('does not mutate the input', () => {
    stripSensitiveFields(student);
    expect(student.email).toBe('ada@school.test');
  });
});

describe('applyTeacherPrivacy', () => {
  it('strips for a TEACHER', async () => {
    const out = await applyTeacherPrivacy(teacher, req(), student);
    expect(out).not.toHaveProperty('email');
    expect(out).not.toHaveProperty('phone');
  });

  it('does NOT strip for a TENANT_ADMIN', async () => {
    const out = await applyTeacherPrivacy(admin, req(), student);
    expect(out).toHaveProperty('email', 'ada@school.test');
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it('writes an audit row with the fields it withheld', async () => {
    await applyTeacherPrivacy(teacher, req('http://x/api/users?role=LEARNER'), student);

    expect(h.auditCreate).toHaveBeenCalledTimes(1);
    const row = h.auditCreate.mock.calls[0][0].data;
    expect(row).toMatchObject({
      orgId: 'org-1',
      userId: 'u-t',
      userRole: 'TEACHER',
      endpoint: '/api/users?role=LEARNER',
      method: 'GET',
      recordsAffected: 1,
      ipAddress: '203.0.113.9',
      userAgent: 'jest',
    });
    expect(row.fieldsStripped).toContain('email');
    expect(row.fieldsStripped).toContain('phone');
  });

  it('counts records for a list', async () => {
    await applyTeacherPrivacy(teacher, req(), [student, student, student]);
    expect(h.auditCreate.mock.calls[0][0].data.recordsAffected).toBe(3);
  });

  it('writes no audit row when nothing was stripped', async () => {
    await applyTeacherPrivacy(teacher, req(), { id: 's1', firstName: 'Ada' });
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it('still returns data when the audit write fails — auditing must not break the request', async () => {
    h.auditCreate.mockRejectedValue(new Error('audit table gone'));
    const out = await applyTeacherPrivacy(teacher, req(), student);
    expect(out).toMatchObject({ firstName: 'Ada' });
    expect(out).not.toHaveProperty('email');
  });
});
