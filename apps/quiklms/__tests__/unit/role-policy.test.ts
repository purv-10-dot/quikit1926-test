import { describe, it, expect } from 'vitest';
import type { LmsUserRole as UserRole } from '@prisma/client';
import {
  ALL_ROLES,
  isUserRole,
  assignableRoles,
  canAssignRole,
} from '@/lib/auth/role-policy';

describe('role-policy — isUserRole', () => {
  it('accepts every enum value', () => {
    for (const r of ALL_ROLES) expect(isUserRole(r)).toBe(true);
  });

  it('rejects unknown / malformed strings', () => {
    for (const bad of ['', 'admin', 'super_admin', 'ADMIN', 'ROOT', 'Teacher '])
      expect(isUserRole(bad)).toBe(false);
  });
});

describe('role-policy — assignableRoles', () => {
  it('ADMIN can assign every role BELOW it but never ADMIN', () => {
    const a = assignableRoles('ADMIN');
    expect(a).not.toContain('ADMIN');
    expect(a).toEqual(
      expect.arrayContaining(['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER', 'PARENT', 'LEARNER']),
    );
  });

  it('TENANT_ADMIN cannot assign TENANT_ADMIN or ADMIN (no lateral / upward)', () => {
    const a = assignableRoles('TENANT_ADMIN');
    expect(a).not.toContain('ADMIN');
    expect(a).not.toContain('TENANT_ADMIN');
    expect(a).toEqual(
      expect.arrayContaining(['SUB_ADMIN', 'MANAGER', 'TEACHER', 'PARENT', 'LEARNER']),
    );
  });

  it('SUB_ADMIN can assign only MANAGER/TEACHER/PARENT/LEARNER', () => {
    const a = assignableRoles('SUB_ADMIN');
    expect(a.sort()).toEqual(['LEARNER', 'MANAGER', 'PARENT', 'TEACHER'].sort());
  });

  it('lower tiers assign only strictly-lower roles', () => {
    // MANAGER outranks the teaching/learning tier (though it never reaches the
    // register policy — that route only admits SUPER/TENANT/SUB admins).
    expect(assignableRoles('MANAGER').sort()).toEqual(['LEARNER', 'PARENT', 'TEACHER'].sort());
    expect(assignableRoles('TEACHER')).toEqual(['LEARNER']);
    expect(assignableRoles('PARENT')).toEqual(['LEARNER']);
    expect(assignableRoles('LEARNER')).toEqual([]);
  });
});

describe('role-policy — canAssignRole (privilege-escalation regression)', () => {
  // The exact hole this fix closes: a lower admin minting a higher-privileged
  // account via POST /api/auth/register (role was previously unvalidated).
  it('TENANT_ADMIN → ADMIN is DENIED', () => {
    expect(canAssignRole('TENANT_ADMIN', 'ADMIN')).toBe(false);
  });

  it('SUB_ADMIN → ADMIN and SUB_ADMIN → TENANT_ADMIN are DENIED', () => {
    expect(canAssignRole('SUB_ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('SUB_ADMIN', 'TENANT_ADMIN')).toBe(false);
  });

  it('no role may assign ADMIN, including ADMIN itself', () => {
    for (const r of ALL_ROLES) expect(canAssignRole(r, 'ADMIN')).toBe(false);
  });

  it('no role may assign its own tier (no lateral escalation)', () => {
    for (const r of ALL_ROLES) expect(canAssignRole(r, r)).toBe(false);
  });

  it('legitimate downward assignments are ALLOWED', () => {
    expect(canAssignRole('TENANT_ADMIN', 'TEACHER')).toBe(true);
    expect(canAssignRole('TENANT_ADMIN', 'PARENT')).toBe(true);
    expect(canAssignRole('TENANT_ADMIN', 'LEARNER')).toBe(true);
    expect(canAssignRole('TENANT_ADMIN', 'SUB_ADMIN')).toBe(true);
    expect(canAssignRole('SUB_ADMIN', 'LEARNER')).toBe(true);
    expect(canAssignRole('ADMIN', 'TENANT_ADMIN')).toBe(true);
  });
});
