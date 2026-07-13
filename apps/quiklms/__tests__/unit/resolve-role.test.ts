import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ userFindUnique: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: h.userFindUnique } } }));

import { resolveLmsRole } from '@/lib/auth/resolve-role';

beforeEach(() => h.userFindUnique.mockReset());

/**
 * The landing redirect must agree with the API guards: prefer the LMS row's
 * fine-grained role, fall back to the coarse membership mapping (operator with
 * no LMS row → SUPER_ADMIN).
 */
describe('resolveLmsRole', () => {
  it('prefers the LMS User.role row over the coarse membership role', async () => {
    // A roster TEACHER carries membershipRole "member" but must NOT land on the
    // learner dashboard — the LMS row wins.
    h.userFindUnique.mockResolvedValue({ role: 'TEACHER' });
    const role = await resolveLmsRole({ id: 'u1', membershipRole: 'member', isSuperAdmin: false });
    expect(role).toBe('TEACHER');
  });

  it('falls back to SUPER_ADMIN for the operator (org_admin, no LMS row)', async () => {
    h.userFindUnique.mockResolvedValue(null);
    const role = await resolveLmsRole({ id: 'op', membershipRole: 'org_admin', isSuperAdmin: false });
    expect(role).toBe('SUPER_ADMIN');
  });

  // Note: the "LMS DB unavailable → fall back to mapping" catch path is
  // exercised deterministically in auth-context-tenant.test.ts (which uses
  // Promise.allSettled and can assert a rejected lookup without tripping
  // vitest 4's unhandled-rejection guard). resolveLmsRole's try/catch is the
  // same defensive shape.
});
