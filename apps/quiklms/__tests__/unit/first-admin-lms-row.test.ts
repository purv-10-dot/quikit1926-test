import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * REGRESSION — the org's FIRST admin was left with no role at all.
 *
 * `POST /api/super/orgs` (quikit) writes `auth.User` + `OrgMember`, then calls this
 * app's `/api/internal/provision-roles` with that CENTRAL user id. But
 * `app_quiklms.UserAppRole.userId` is a foreign key to `app_quiklms.users` — a LOCAL
 * table — and nothing had created a row there for that person. `ensureUserOnLmsRole`
 * therefore hit its `if (!lmsUser) return` guard and did nothing, silently.
 *
 * Two things were wrong, and both are covered here:
 *
 *   1. Nobody bridged the central id to an LMS row. `ensureLmsUserForCentralId`
 *      now does, reading the central `User` for the name/email.
 *   2. The no-op was invisible. `ensureUserOnLmsRole` returned void, so the caller
 *      counted a skipped user as `assigned: 1` — which is why this went unnoticed.
 *      It returns a boolean now.
 *
 * The knock-on damage this caused, and why it mattered more than a missing row:
 * `roleForNewMember` counts ADMIN-tier ASSIGNMENTS to decide whether an org still
 * has an administrator. With none, the first person that admin invited was silently
 * promoted to TENANT_ADMIN regardless of the role actually chosen.
 */

const h = vi.hoisted(() => ({
  lmsUserFindUnique: vi.fn(),
  lmsUserFindFirst: vi.fn(),
  centralUserFindUnique: vi.fn(),
  registerUser: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    lmsUser: { findUnique: h.lmsUserFindUnique, findFirst: h.lmsUserFindFirst },
  },
}));
vi.mock('@/lib/org-db', () => ({
  orgDb: { user: { findUnique: h.centralUserFindUnique } },
  ORG_DB_ENABLED: true,
}));
vi.mock('@/lib/services/auth-service', () => ({ registerUser: h.registerUser }));
// identity-service pulls these in at module load; none is exercised by this helper.
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/api/seed-lms-app-roles', () => ({
  ensureUserOnLmsRole: vi.fn(),
  LMS_SYSTEM_ADMIN_ROLE: 'admin',
}));
vi.mock('@/lib/api/seed-lms-permissions', () => ({ ensureLmsRbacSeeded: vi.fn() }));

import { ensureLmsUserForCentralId } from '@/lib/services/identity-service';

const CENTRAL = { email: 'Admin@Acme.COM', firstName: 'Asha', lastName: 'Rao' };

beforeEach(() => {
  vi.clearAllMocks();
  h.lmsUserFindUnique.mockResolvedValue(null);
  h.lmsUserFindFirst.mockResolvedValue(null);
  h.centralUserFindUnique.mockResolvedValue(CENTRAL);
  h.registerUser.mockResolvedValue({ data: { id: 'u1' } });
});

describe('ensureLmsUserForCentralId', () => {
  it('creates the LMS row from the central User — the case that was broken', async () => {
    const ok = await ensureLmsUserForCentralId('u1', 'org1', 'ADMIN');

    expect(ok).toBe(true);
    expect(h.registerUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'u1',
        email: CENTRAL.email,
        firstName: 'Asha',
        lastName: 'Rao',
        role: 'ADMIN',
        orgId: 'org1',
      }),
    );
  });

  it('is idempotent — an existing LMS row is a pass, not a second create', async () => {
    h.lmsUserFindUnique.mockResolvedValue({ id: 'u1' });

    expect(await ensureLmsUserForCentralId('u1', 'org1', 'ADMIN')).toBe(true);
    expect(h.registerUser).not.toHaveBeenCalled();
  });

  it('refuses an id the platform does not know rather than inventing a person', async () => {
    h.centralUserFindUnique.mockResolvedValue(null);

    expect(await ensureLmsUserForCentralId('ghost', 'org1', 'ADMIN')).toBe(false);
    expect(h.registerUser).not.toHaveBeenCalled();
  });

  it('refuses when the email already belongs to a DIFFERENT LMS row', async () => {
    // One LmsUser per email today (`id` still doubles as the central id). Taking the
    // row would silently re-home someone else's account; `registerUser` would throw
    // anyway, so this reports the skip instead of raising inside a best-effort path.
    h.lmsUserFindFirst.mockResolvedValue({ id: 'someone-else' });

    expect(await ensureLmsUserForCentralId('u1', 'org1', 'ADMIN')).toBe(false);
    expect(h.registerUser).not.toHaveBeenCalled();
  });

  it('never throws — a failure here must not discard the role seeding already done', async () => {
    h.registerUser.mockRejectedValue(new Error('db down'));

    await expect(ensureLmsUserForCentralId('u1', 'org1', 'ADMIN')).resolves.toBe(false);
  });

  it('reports false on missing arguments instead of querying', async () => {
    expect(await ensureLmsUserForCentralId('', 'org1', 'ADMIN')).toBe(false);
    expect(await ensureLmsUserForCentralId('u1', '', 'ADMIN')).toBe(false);
    expect(h.centralUserFindUnique).not.toHaveBeenCalled();
  });
});
