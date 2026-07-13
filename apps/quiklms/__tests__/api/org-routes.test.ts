import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  appFindUnique: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindFirst: vi.fn(),
  memberUpdate: vi.fn(),
  uaaCreateMany: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/org-db', () => ({
  orgDb: {
    app: { findUnique: h.appFindUnique },
    orgMember: { findMany: h.memberFindMany, findFirst: h.memberFindFirst, update: h.memberUpdate },
    userAppAccess: { createMany: h.uaaCreateMany },
  },
}));

import { GET as membershipsGET } from '@/app/api/org/memberships/route';
import { POST as invitationsPOST } from '@/app/api/org/invitations/route';

const actor = { id: 'u1', isActive: true };

function req(url: string, body?: unknown) {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  }) as never;
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue(actor);
});

describe('GET /api/org/memberships', () => {
  it('returns the active orgs where the user has QuikLMS access', async () => {
    h.appFindUnique.mockResolvedValue({ id: 'app-lms' });
    h.memberFindMany.mockResolvedValue([
      {
        id: 'm1',
        role: 'member',
        status: 'active',
        acceptedAt: null,
        org: { id: 'o1', name: 'Acme', slug: 'acme', plan: 'pro', status: 'active', logoUrl: null, brandColor: null },
      },
    ]);

    const res = await membershipsGET(req('http://t/api/org/memberships'), {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, data: [{ orgId: 'o1', slug: 'acme', role: 'member' }] });

    // App-scoped: the query filters orgs by UserAppAccess for the quiklms app id.
    expect(h.memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          status: 'active',
          org: expect.objectContaining({
            status: 'active',
            userAppAccess: { some: { userId: 'u1', appId: 'app-lms' } },
          }),
        }),
      }),
    );
  });

  it('skips the app filter when the app row is not seeded', async () => {
    h.appFindUnique.mockResolvedValue(null);
    h.memberFindMany.mockResolvedValue([]);

    await membershipsGET(req('http://t/api/org/memberships'), {} as never);
    const where = h.memberFindMany.mock.calls[0][0].where;
    expect(where.org).toEqual({ status: 'active' }); // no userAppAccess clause
  });

  it('returns 401 when unauthenticated', async () => {
    const { Unauthorized } = await import('@/lib/http');
    h.requireAuth.mockRejectedValue(Unauthorized('Not authenticated.'));

    const res = await membershipsGET(req('http://t/api/org/memberships'), {} as never);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/org/invitations', () => {
  it('accepts an invited membership, activates it, and grants the invited apps', async () => {
    h.memberFindFirst.mockResolvedValue({
      id: 'm1',
      orgId: 'o1',
      role: 'app_admin',
      inviteAppIds: ['app-lms', 'app-x'],
      createdBy: 'admin1',
      status: 'invited',
    });
    h.memberUpdate.mockResolvedValue({});
    h.uaaCreateMany.mockResolvedValue({ count: 2 });

    const res = await invitationsPOST(req('http://t/api/org/invitations', { membershipId: 'm1', action: 'accept' }), {} as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { status: 'active', orgId: 'o1' } });

    expect(h.memberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({ status: 'active', invitationToken: null }),
      }),
    );
    // app_admin invite → admin role on each granted app.
    expect(h.uaaCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { userId: 'u1', orgId: 'o1', appId: 'app-lms', role: 'admin', grantedBy: 'admin1' },
          { userId: 'u1', orgId: 'o1', appId: 'app-x', role: 'admin', grantedBy: 'admin1' },
        ],
        skipDuplicates: true,
      }),
    );
  });

  it('declines an invited membership without granting apps', async () => {
    h.memberFindFirst.mockResolvedValue({ id: 'm1', orgId: 'o1', role: 'member', inviteAppIds: [], status: 'invited' });
    h.memberUpdate.mockResolvedValue({});

    const res = await invitationsPOST(req('http://t/api/org/invitations', { membershipId: 'm1', action: 'decline' }), {} as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { status: 'declined' } });
    expect(h.memberUpdate).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'inactive' } });
    expect(h.uaaCreateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when no pending invitation matches', async () => {
    h.memberFindFirst.mockResolvedValue(null);

    const res = await invitationsPOST(req('http://t/api/org/invitations', { membershipId: 'nope', action: 'accept' }), {} as never);
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid input', async () => {
    const res = await invitationsPOST(req('http://t/api/org/invitations', { action: 'sideways' }), {} as never);
    expect(res.status).toBe(400);
  });
});
