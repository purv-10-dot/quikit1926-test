/**
 * The `authUserId` bridge — Phase 1 (C-3).
 *
 * `LmsUser.id` has always doubled as the central `auth.User.id`, enforced by
 * nothing but a naming convention. `authUserId` makes that link an explicit,
 * constrained column, matching `Employee.authUserId` in HRMS (baseline §9).
 *
 * These pin the one behaviour Phase 1 introduces: the column is populated at the
 * single place LMS rows are created, so it cannot drift out of date — and it is
 * left NULL, not faked, when there is no central identity to point at.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ create: vi.fn(), findFirst: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: { lmsUser: { create: h.create, findFirst: h.findFirst } },
}));

import { registerUser } from '@/lib/services/auth-service';

const base = { email: 'Ada@Acme.test', firstName: 'Ada', lastName: 'L', role: 'LEARNER' };
const createdData = () => h.create.mock.calls[0][0].data;

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.findFirst.mockResolvedValue(null);
  h.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: data.id ?? 'generated', ...data }));
});

describe('a centrally-provisioned person is bridged', () => {
  it('records authUserId alongside the shared id', async () => {
    await registerUser({ ...base, id: 'central-user-1', orgId: 'org-1' });

    expect(createdData()).toMatchObject({ id: 'central-user-1', authUserId: 'central-user-1' });
  });

  it('mirrors id today — the values are equal, which is what makes Phase 1 a no-op', async () => {
    await registerUser({ ...base, id: 'central-user-1', orgId: 'org-1' });

    const d = createdData();
    expect(d.authUserId).toBe(d.id);
  });
});

describe('a person with no central identity is NOT faked', () => {
  it('leaves authUserId unset rather than inventing a link', async () => {
    // No `id` passed → nobody provisioned a central User for this row. NULL is
    // the correct state (HRMS uses it the same way for manual employees);
    // writing a placeholder would assert an identity that does not exist.
    await registerUser({ ...base, orgId: 'org-1' });

    const d = createdData();
    expect(d).not.toHaveProperty('authUserId');
    expect(d).not.toHaveProperty('id');
  });
});

describe('the row still carries no credentials', () => {
  it('never writes a password — those columns were dropped with S-3', async () => {
    await registerUser({ ...base, id: 'central-user-1', orgId: 'org-1' });

    const d = createdData();
    for (const gone of ['password', 'mustChangePassword', 'passwordSetupToken', 'activeSessionId']) {
      expect(d).not.toHaveProperty(gone);
    }
  });
});
