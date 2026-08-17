import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * QuikLMS is single-role-per-user (quikscale parity). This suite is the guard
 * that keeps multi-role/secondary-role/active-role-switching from creeping
 * back in — mirroring `no-super-admin.test.ts`'s pattern of negative
 * assertions against the vocabulary/surface rather than simulated behavior.
 *
 * Removed in this pass: `LmsUser.secondaryRole` (still a column in the shared
 * schema — Rule 2 forbids dropping it from here — but nothing in this app may
 * read or write it again), `lib/auth/active-role.ts`, the `qs_role` cookie
 * mechanism, and the "Switch role" UI.
 */

const APP_ROOT = path.resolve(__dirname, '..', '..');
const SKIP_DIRS = new Set([
  'node_modules', '.next', '__tests__',
  '_retired-migrations', // frozen history — CLAUDE.md §1.6 says don't edit it
]);
const SKIP_FILES = new Set([
  path.join(APP_ROOT, 'scripts', 'etl', 'migrate.ts'), // one-time historical data migration
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !SKIP_FILES.has(full)) out.push(full);
  }
  return out;
}

describe('multi-role / secondary-role is gone from the app surface', () => {
  it('lib/auth/active-role.ts does not exist', () => {
    expect(fs.existsSync(path.join(APP_ROOT, 'lib', 'auth', 'active-role.ts'))).toBe(false);
  });

  it('components/AdaptiveShell.tsx does not exist', () => {
    expect(fs.existsSync(path.join(APP_ROOT, 'components', 'AdaptiveShell.tsx'))).toBe(false);
  });

  it('no live source file sets or reads the qs_role cookie', () => {
    const offenders: string[] = [];
    for (const file of walk(APP_ROOT)) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes('qs_role')) offenders.push(path.relative(APP_ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it('no live source file reads or writes LmsUser.secondaryRole', () => {
    const offenders: string[] = [];
    for (const file of walk(APP_ROOT)) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes('secondaryRole')) offenders.push(path.relative(APP_ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it('the promote-subadmin / revoke-subadmin routes are gone', () => {
    expect(fs.existsSync(path.join(APP_ROOT, 'app', 'api', 'users', '[id]', 'promote-subadmin'))).toBe(false);
    expect(fs.existsSync(path.join(APP_ROOT, 'app', 'api', 'users', '[id]', 'revoke-subadmin'))).toBe(false);
  });
});

const h = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  orgMemberFindFirst: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: h.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { findUnique: h.userFindUnique },
    lmsTenant: { findUnique: h.tenantFindUnique },
    orgMember: { findFirst: h.orgMemberFindFirst },
  },
}));
vi.mock('@/lib/auth/central-access', () => ({ hasCentralAppAccess: vi.fn().mockResolvedValue(true) }));

import { getAuthContext, userHasRole } from '@/lib/auth/context';
import { _clearCentralMembershipCache } from '@/lib/auth/founding-admin';

const sessionFor = (over: Record<string, unknown> = {}) => ({
  user: {
    id: 'u1', orgId: 'org1', email: 'a@b.com', membershipRole: 'member',
    isSuperAdmin: false, firstName: 'A', lastName: 'B', ...over,
  },
});

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.orgMemberFindFirst.mockResolvedValue(null);
  _clearCentralMembershipCache();
});

describe('getAuthContext resolves a single role, ignoring a stale secondaryRole column', () => {
  it('returns no secondaryRole/roles field even if the DB row still has one', async () => {
    h.getServerSession.mockResolvedValue(sessionFor());
    // Simulates a pre-migration row a backfill hasn't reached yet — the column
    // still physically exists (Rule 2: the shared schema is not ours to edit).
    h.userFindUnique.mockResolvedValue({ role: 'TEACHER', secondaryRole: 'SUB_ADMIN', isActive: true } as never);
    h.tenantFindUnique.mockResolvedValue({ tenantType: 'school' });

    const ctx = await getAuthContext();
    expect(ctx?.role).toBe('TEACHER');
    expect(ctx).not.toHaveProperty('secondaryRole');
    expect(ctx).not.toHaveProperty('roles');
  });
});

describe('userHasRole is single-role only', () => {
  it('matches the primary role', () => {
    expect(userHasRole({ role: 'SUB_ADMIN' } as never, 'SUB_ADMIN')).toBe(true);
  });

  it('ignores an extra secondaryRole-shaped property, even if present on the object', () => {
    const withStaleField = { role: 'TEACHER', secondaryRole: 'SUB_ADMIN' } as never;
    expect(userHasRole(withStaleField, 'SUB_ADMIN')).toBe(false);
  });
});
