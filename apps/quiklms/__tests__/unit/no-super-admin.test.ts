import { describe, it, expect } from 'vitest';
import { LmsUserRole } from '@prisma/client';
import { LMS_APP_ROLES, LMS_SYSTEM_ADMIN_ROLE, lmsRoleToAppRoleName } from '@/lib/api/seed-lms-app-roles';
import { ALL_ROLES, isUserRole, assignableRoles, canAssignRole } from '@/lib/auth/role-policy';
import { PERMISSION_MATRIX, UNGATED_ROLES } from '@/lib/auth/permission-matrix.generated';

/**
 * QuikLMS has ONE admin tier above the tenants, and it is called `admin`/`ADMIN`.
 *
 * This suite is the guard that keeps `SUPER_ADMIN` from creeping back. The name was
 * removed because it described two unrelated things at once:
 *
 *   • an LMS ROLE — the org's founding administrator, who onboards school and
 *     corporate tenants, and who is org-scoped like everybody else; and
 *   • `isSuperAdmin` — quikit's platform-operator CLAIM, which is the only thing that
 *     grants cross-tenant data access (see `tenantWhere` in lib/auth/context.ts).
 *
 * Conflating them is what once leaked one org's rows into another's console. The claim
 * survives under its own name; the role does not. A `SUPER_ADMIN` string reappearing
 * anywhere in the role vocabulary means that distinction is being lost again.
 */
describe('SUPER_ADMIN is gone from the role vocabulary', () => {
  it('is not an LmsUserRole enum member', () => {
    expect(Object.keys(LmsUserRole)).not.toContain('SUPER_ADMIN');
    expect(Object.values(LmsUserRole)).not.toContain('SUPER_ADMIN');
  });

  it('exposes ADMIN as the top tier instead', () => {
    expect(Object.values(LmsUserRole)).toContain('ADMIN');
    // Exactly seven tiers — the rename replaced a value, it did not add one.
    expect(Object.values(LmsUserRole)).toHaveLength(7);
  });

  it('is absent from the seeded AppRole catalogue', () => {
    const names = LMS_APP_ROLES.map((r) => r.name);
    expect(names).not.toContain('SUPER_ADMIN');
    // Seven catalogue rows, one per enum tier — `admin` covers ADMIN.
    expect(names).toHaveLength(7);
    expect(names).toContain(LMS_SYSTEM_ADMIN_ROLE);
  });

  it('keeps exactly one isSystem role, and it is `admin`', () => {
    const system = LMS_APP_ROLES.filter((r) => r.isSystem);
    expect(system).toHaveLength(1);
    expect(system[0].name).toBe('admin');
  });

  it('is absent from role-policy and the derived permission matrix', () => {
    expect(ALL_ROLES).not.toContain('SUPER_ADMIN');
    expect(ALL_ROLES).toContain('ADMIN');
    expect(isUserRole('SUPER_ADMIN')).toBe(false);
    expect(UNGATED_ROLES).not.toContain('SUPER_ADMIN');

    // No grant anywhere may still name the removed role. `seedLmsPermissions`
    // resolves matrix names against the catalogue, so a stale key would silently
    // land in `unknownRoles` and grant nothing.
    const stale: string[] = [];
    for (const [resource, actions] of Object.entries(PERMISSION_MATRIX)) {
      for (const [action, roles] of Object.entries(actions)) {
        if (roles?.includes('SUPER_ADMIN' as never)) stale.push(`${resource}.${action}`);
      }
    }
    expect(stale).toEqual([]);
  });
});

/**
 * The enum and the catalogue disagree on ONE name, and everything that resolves a
 * role by name has to know it. `admin` is the platform-standard `isSystem` row every
 * QuikIT app seeds; `ADMIN` is the enum member it stands for.
 */
describe('ADMIN ↔ admin name bridge', () => {
  it('maps the top tier to the `admin` catalogue row', () => {
    expect(lmsRoleToAppRoleName('ADMIN')).toBe('admin');
    expect(lmsRoleToAppRoleName('ADMIN')).toBe(LMS_SYSTEM_ADMIN_ROLE);
  });

  it('passes the other six tiers through unchanged', () => {
    for (const role of ['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER', 'PARENT', 'LEARNER'] as const) {
      expect(lmsRoleToAppRoleName(role)).toBe(role);
    }
  });

  // Regression: every matrix role name must resolve to a real catalogue row. Before
  // the bridge existed, `roleIdByName.get('ADMIN')` missed — there is no row by that
  // name — and all ~228 top-tier grants were dropped on the floor, leaving the org's
  // most privileged role with a guest's authority.
  it('resolves every matrix role name to a seeded catalogue row', () => {
    const catalogue = new Set(LMS_APP_ROLES.map((r) => r.name));
    const unresolvable = new Set<string>();

    for (const actions of Object.values(PERMISSION_MATRIX)) {
      for (const roles of Object.values(actions)) {
        for (const roleName of roles ?? []) {
          if (!catalogue.has(lmsRoleToAppRoleName(roleName as LmsUserRole))) {
            unresolvable.add(roleName);
          }
        }
      }
    }

    expect([...unresolvable]).toEqual([]);
  });

  it('grants the top tier a non-empty share of the matrix', () => {
    let adminPairs = 0;
    for (const actions of Object.values(PERMISSION_MATRIX)) {
      for (const roles of Object.values(actions)) {
        if (roles?.includes('ADMIN' as never)) adminPairs += 1;
      }
    }
    // Guards the "renamed the role, forgot to regenerate the matrix" failure, which
    // typechecks cleanly and locks the top tier out of everything.
    expect(adminPairs).toBeGreaterThan(200);
  });
});

/**
 * The tier boundary the rename had to preserve: `ADMIN` and `TENANT_ADMIN` are
 * SIBLINGS, not nested. ADMIN onboards school/corporate tenants; TENANT_ADMIN runs
 * one of them. Neither may mint the other.
 */
describe('ADMIN is not mintable from inside the LMS', () => {
  it('is never assignable by any role via the roster', () => {
    for (const actor of ALL_ROLES) {
      expect(assignableRoles(actor)).not.toContain('ADMIN');
      expect(canAssignRole(actor, 'ADMIN')).toBe(false);
    }
  });

  it('does not let a TENANT_ADMIN or SUB_ADMIN escalate', () => {
    expect(canAssignRole('TENANT_ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('SUB_ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('SUB_ADMIN', 'TENANT_ADMIN')).toBe(false);
  });

  it('outranks TENANT_ADMIN so the top tier may still delegate downward', () => {
    expect(assignableRoles('ADMIN')).toContain('TENANT_ADMIN');
    expect(assignableRoles('ADMIN')).toContain('LEARNER');
  });
});
