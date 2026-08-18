import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * REGRESSION — an organisation's admin was displayed as `member`.
 *
 * quikit's invitation-accept handler picks the central role with
 * `membership.role === APP_ADMIN ? "admin" : "member"`, which never matches
 * `org_admin` — the role its own create-org flow assigns. So the top-tier admin's
 * `UserAppAccess.role` was written as `member`.
 *
 * `ensureUserOnLmsRole` already mirrors the right name, but it runs at PROVISIONING
 * time — before the invitation is accepted, so before the `UserAppAccess` row
 * exists. `mirrorAppRoleToCentral` is an `updateMany`, so it matched nothing and
 * did not fail. Acceptance then created the row as `member` and nothing corrected
 * it. Confirmed against a real org admin: LMS role `admin`, portal showed `member`.
 *
 * The two properties that matter here, and neither is about the happy path:
 *
 *   1. It mirrors the CATALOGUE name (`admin`), not the enum (`ADMIN`). The central
 *      column holds catalogue names — writing the enum would swap one wrong value
 *      for another.
 *   2. It writes ONLY the central copy. Authorization reads
 *      `app_quiklms.UserAppRole`, and a user with no assignment must keep resolving
 *      through the grant fallback rather than have a derived role persisted for
 *      them. A future edit that "helpfully" also assigns would change who people
 *      are, from a display fix.
 */

const h = vi.hoisted(() => ({
  appFindFirst: vi.fn(),
  mirror: vi.fn(),
  userAppRoleFindFirst: vi.fn(),
  userAppRoleCreate: vi.fn(),
  userAppRoleDeleteMany: vi.fn(),
}));

vi.mock('@quikit/auth/assign-app-roles', () => ({ mirrorAppRoleToCentral: h.mirror }));
vi.mock('@/lib/db', () => ({
  db: {
    app: { findFirst: h.appFindFirst },
    lmsUserAppRole: {
      findFirst: h.userAppRoleFindFirst,
      create: h.userAppRoleCreate,
      deleteMany: h.userAppRoleDeleteMany,
    },
    lmsAppRole: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    lmsUser: { findUnique: vi.fn() },
  },
}));

import { syncCentralAppRoleMirror, LMS_SYSTEM_ADMIN_ROLE } from '@/lib/api/seed-lms-app-roles';

beforeEach(() => {
  vi.clearAllMocks();
  h.appFindFirst.mockResolvedValue({ id: 'app-quiklms' });
});

describe('syncCentralAppRoleMirror', () => {
  it('writes the CATALOGUE name for the top tier — admin, not ADMIN', async () => {
    await syncCentralAppRoleMirror('u-admin', 'org-a', 'ADMIN');

    expect(h.mirror).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: 'org-a',
        userId: 'u-admin',
        appId: 'app-quiklms',
        roleName: LMS_SYSTEM_ADMIN_ROLE,
      }),
    );
    expect(h.mirror.mock.calls[0][1].roleName).toBe('admin');
  });

  it('leaves the other six roles on their own names', async () => {
    await syncCentralAppRoleMirror('u-ta', 'org-a', 'TENANT_ADMIN');
    expect(h.mirror.mock.calls[0][1].roleName).toBe('TENANT_ADMIN');
  });

  it('NEVER touches the assignment table — this is a display fix only', async () => {
    await syncCentralAppRoleMirror('u-admin', 'org-a', 'ADMIN');

    expect(h.userAppRoleCreate).not.toHaveBeenCalled();
    expect(h.userAppRoleDeleteMany).not.toHaveBeenCalled();
  });

  // NOTE: the dedupe set and the App-id cache are module-level and deliberately
  // outlive a single call, so every case below uses its own user id. Sharing one
  // would silently pass by hitting the cache rather than the branch under test.
  it('is one write per user/org/role, not one per page load', async () => {
    await syncCentralAppRoleMirror('u-dedupe', 'org-a', 'ADMIN');
    await syncCentralAppRoleMirror('u-dedupe', 'org-a', 'ADMIN');
    await syncCentralAppRoleMirror('u-dedupe', 'org-a', 'ADMIN');

    expect(h.mirror).toHaveBeenCalledTimes(1);
  });

  it('re-mirrors when the role actually changed', async () => {
    await syncCentralAppRoleMirror('u-changed', 'org-a', 'LEARNER');
    await syncCentralAppRoleMirror('u-changed', 'org-a', 'TEACHER');

    expect(h.mirror).toHaveBeenCalledTimes(2);
    expect(h.mirror.mock.calls[1][1].roleName).toBe('TEACHER');
  });

  it('does nothing without a user or an org', async () => {
    await syncCentralAppRoleMirror('', 'org-a', 'ADMIN');
    await syncCentralAppRoleMirror('u-noorg', '', 'ADMIN');

    expect(h.mirror).not.toHaveBeenCalled();
    expect(h.appFindFirst).not.toHaveBeenCalled(); // bails before querying
  });

  it('does nothing when QuikLMS is absent from the App catalogue', async () => {
    // Fresh module instance — `cachedAppId` is resolved once per process, so the
    // null must be in place before the first lookup.
    vi.resetModules();
    h.appFindFirst.mockResolvedValue(null);
    const mod = await import('@/lib/api/seed-lms-app-roles');

    await mod.syncCentralAppRoleMirror('u-noapp', 'org-a', 'ADMIN');

    expect(h.mirror).not.toHaveBeenCalled();
  });
});
