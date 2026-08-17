/**
 * The role-assignment self-heal.
 *
 * A centrally-invited admin lands in QuikLMS with no `UserAppRole` row, because
 * `activate/route.ts` only sends `status:"active"` admins to provision-roles and
 * nothing re-runs after the invite is accepted. The role resolvers cover for
 * that with a fallback to `OrgMember.role`, which works — but leaves the RBAC
 * table permanently empty, so the fallback never stops being needed.
 *
 * These pin the repair AND its guard rails. The guard rails matter more than the
 * happy path: this runs on every API guard and page guard, so a heal that fires
 * too eagerly would rewrite roles it has no business touching.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ ensureUserOnLmsRole: vi.fn() }));

vi.mock('@/lib/api/seed-lms-app-roles', () => ({
  ensureUserOnLmsRole: h.ensureUserOnLmsRole,
}));

import { healLmsRoleAssignment } from '@/lib/auth/heal-role-assignment';

/** The helper is fire-and-forget; let its promise chain settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  h.ensureUserOnLmsRole.mockResolvedValue(true);
});

describe('healLmsRoleAssignment', () => {
  it('writes the assignment for a user who fell through to the central role', async () => {
    healLmsRoleAssignment('u-write', 'org1', 'ADMIN');
    await settle();
    expect(h.ensureUserOnLmsRole).toHaveBeenCalledWith('u-write', 'org1', 'ADMIN');
  });

  it('persists the role it was given — never a different one', async () => {
    healLmsRoleAssignment('u-teacher', 'org1', 'TEACHER');
    await settle();
    expect(h.ensureUserOnLmsRole).toHaveBeenCalledWith('u-teacher', 'org1', 'TEACHER');
  });

  it('skips the platform operator — grants are org-scoped, the operator is not', async () => {
    healLmsRoleAssignment('op', 'org1', 'ADMIN', true);
    await settle();
    expect(h.ensureUserOnLmsRole).not.toHaveBeenCalled();
  });

  it('skips when there is no org to scope the grant to', async () => {
    healLmsRoleAssignment('u1', null, 'ADMIN');
    healLmsRoleAssignment('u1', undefined, 'ADMIN');
    healLmsRoleAssignment(null, 'org1', 'ADMIN');
    await settle();
    expect(h.ensureUserOnLmsRole).not.toHaveBeenCalled();
  });

  // Cost guard: this sits on the path of 292 handlers, so a user browsing ten
  // pages must not issue ten writes.
  it('writes once per (user, org) even when called repeatedly', async () => {
    healLmsRoleAssignment('u-dedupe', 'org1', 'ADMIN');
    healLmsRoleAssignment('u-dedupe', 'org1', 'ADMIN');
    healLmsRoleAssignment('u-dedupe', 'org1', 'ADMIN');
    await settle();
    expect(h.ensureUserOnLmsRole).toHaveBeenCalledTimes(1);
  });

  it('still heals the same user in a different org', async () => {
    healLmsRoleAssignment('u-multi', 'orgA', 'ADMIN');
    healLmsRoleAssignment('u-multi', 'orgB', 'ADMIN');
    await settle();
    expect(h.ensureUserOnLmsRole).toHaveBeenCalledTimes(2);
  });

  it('retries on the next request when the write returned false', async () => {
    h.ensureUserOnLmsRole.mockResolvedValue(false);
    healLmsRoleAssignment('u-false', 'org1', 'ADMIN');
    await settle();

    h.ensureUserOnLmsRole.mockResolvedValue(true);
    healLmsRoleAssignment('u-false', 'org1', 'ADMIN');
    await settle();
    expect(h.ensureUserOnLmsRole).toHaveBeenCalledTimes(2);
  });

  it('retries on the next request when the write threw', async () => {
    h.ensureUserOnLmsRole.mockRejectedValue(new Error('db down'));
    healLmsRoleAssignment('u-throw', 'org1', 'ADMIN');
    await settle();

    h.ensureUserOnLmsRole.mockResolvedValue(true);
    healLmsRoleAssignment('u-throw', 'org1', 'ADMIN');
    await settle();
    expect(h.ensureUserOnLmsRole).toHaveBeenCalledTimes(2);
  });

  // The whole point of fire-and-forget: a broken RBAC write must never turn a
  // working request into a failed one.
  it('never throws, even when the underlying write rejects', async () => {
    h.ensureUserOnLmsRole.mockRejectedValue(new Error('boom'));
    expect(() => healLmsRoleAssignment('u-safe', 'org1', 'ADMIN')).not.toThrow();
    await settle();
  });

  it('returns synchronously — it must not block the guard', () => {
    h.ensureUserOnLmsRole.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    healLmsRoleAssignment('u-sync', 'org1', 'ADMIN');
    expect(Date.now() - t0).toBeLessThan(50);
  });
});
