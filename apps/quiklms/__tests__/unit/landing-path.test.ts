/**
 * A SCHOOL tenant admin must land on the SCHOOL dashboard.
 *
 * This app ships two tenant-admin dashboards:
 *
 *   /tenant-dashboard  — corporate: learners, managers, course assignments
 *   /school-dashboard  — school:    students, teachers, batches, attendance
 *
 * Four separate places hardcoded `TENANT_ADMIN: '/tenant-dashboard'` — the root
 * landing redirect, the 404 page, the server-side page guard, and the topbar
 * role switcher. So every school admin was dropped on the corporate dashboard,
 * every time, no matter that their tenant was created as a school. The school
 * dashboard existed and was simply unreachable by default.
 *
 * `landingPathFor` is now the single resolver all four call. These pin the
 * behaviour so a fifth copy cannot quietly reintroduce it.
 */
import { describe, it, expect } from 'vitest';
import { landingPathFor, DEFAULT_LANDING } from '@/lib/auth/landing';

describe('tenant admins route by tenant kind', () => {
  it('a SCHOOL admin lands on the school dashboard', () => {
    expect(landingPathFor('TENANT_ADMIN', 'school')).toBe('/school-dashboard');
  });

  it('a CORPORATE admin lands on the tenant dashboard', () => {
    expect(landingPathFor('TENANT_ADMIN', 'corporate')).toBe('/tenant-dashboard');
  });

  it('falls back to corporate when the kind is unknown', () => {
    // Safer default: it does not assume school-only features exist. Also the
    // historical behaviour, so an unresolvable tenant is no worse than before.
    for (const t of [null, undefined] as const) {
      expect(landingPathFor('TENANT_ADMIN', t)).toBe('/tenant-dashboard');
    }
  });
});

describe('every other role is unaffected by tenant kind', () => {
  const CASES: [string, string][] = [
    ['SUPER_ADMIN', '/dashboard'],
    ['SUB_ADMIN', '/sub-admin-dashboard'],
    ['MANAGER', '/manager-dashboard'],
    ['TEACHER', '/teacher-dashboard'],
    ['PARENT', '/parent-dashboard'],
    ['LEARNER', '/learner/dashboard'],
  ];

  for (const [role, path] of CASES) {
    it(`${role} → ${path} in both school and corporate`, () => {
      expect(landingPathFor(role, 'school')).toBe(path);
      expect(landingPathFor(role, 'corporate')).toBe(path);
    });
  }
});

describe('unknown input never produces a broken redirect', () => {
  it('an unrecognised role falls back to the learner dashboard', () => {
    expect(landingPathFor('SOMETHING_ELSE', 'school')).toBe(DEFAULT_LANDING);
  });

  it('a null or undefined role falls back too', () => {
    expect(landingPathFor(null)).toBe(DEFAULT_LANDING);
    expect(landingPathFor(undefined)).toBe(DEFAULT_LANDING);
  });

  it('always returns an absolute in-app path', () => {
    for (const r of ['TENANT_ADMIN', 'LEARNER', 'nonsense', null]) {
      expect(landingPathFor(r, 'school').startsWith('/')).toBe(true);
    }
  });
});
