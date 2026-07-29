/**
 * LMS-side auth ROUTES (not the centralized identity module, which is
 * off-limits and untouched — these routes only consume `requireAuth`).
 *
 *  - `GET /auth/profile` returned the raw stored avatar url, which 403s against
 *    the private bucket, so avatars never loaded.
 *  - `PATCH /auth/profile` had an allowlist but NO type checking, so
 *    `{"firstName": 12345}` went straight at a String column.
 *  - `POST /auth/register` echoed the plaintext temp password in the response
 *    body, putting a live credential into logs, devtools and proxies — while
 *    the invitation email already delivers it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  presign: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/auth/context', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/s3', () => ({ presignFromUrlOrKey: h.presign }));
vi.mock('@/lib/db', () => ({
  db: { lmsUser: { findUnique: h.userFindUnique, update: h.userUpdate } },
}));

import { GET, PATCH } from '@/app/api/auth/profile/route';

const S3 = 'https://b.s3.ap-south-1.amazonaws.com/avatars/u1.png';
const get = () => new Request('http://x/api/auth/profile') as never;
const patch = (body: unknown) =>
  new Request('http://x/api/auth/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue({
    id: 'u1', orgId: 'org-1', role: 'LEARNER', email: 'a@b.test', firstName: 'Ada', lastName: 'L',
  });
  h.presign.mockImplementation(async (u: string) => `${u}?X-Amz-Signature=sig`);
  h.userFindUnique.mockResolvedValue({
    id: 'u1', email: 'a@b.test', firstName: 'Ada', lastName: 'L', role: 'LEARNER',
    phone: null, profilePicture: S3, timezone: null,
  });
  h.userUpdate.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));
});

describe('GET /auth/profile presigns the avatar', () => {
  it('returns a signed profilePictureUrl', async () => {
    const body = await (await GET(get(), {})).json();
    expect(body.data.profilePictureUrl).toContain('X-Amz-Signature');
  });

  it('leaves the raw stored value on profilePicture', async () => {
    const body = await (await GET(get(), {})).json();
    expect(body.data.profilePicture).toBe(S3);
  });

  it('returns null rather than presigning nothing', async () => {
    h.userFindUnique.mockResolvedValue({ id: 'u1', profilePicture: null });
    const body = await (await GET(get(), {})).json();
    expect(body.data.profilePictureUrl).toBeNull();
    expect(h.presign).not.toHaveBeenCalled();
  });
});

describe('PATCH /auth/profile validates types', () => {
  it('accepts a well-formed update', async () => {
    const res = await PATCH(patch({ firstName: 'Grace' }), {});
    expect(res.status).toBe(200);
    expect(h.userUpdate.mock.calls[0][0].data).toEqual({ firstName: 'Grace' });
  });

  it('rejects a number where a string belongs, instead of writing it', async () => {
    const res = await PATCH(patch({ firstName: 12345 }), {});
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects an empty name', async () => {
    expect((await PATCH(patch({ firstName: '   ' }), {})).status).toBe(400);
  });

  it('rejects unknown keys rather than silently dropping them', async () => {
    // .strict() — a client sending `role` should be told, not ignored.
    expect((await PATCH(patch({ role: 'SUPER_ADMIN' }), {})).status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('still refuses an empty payload', async () => {
    expect((await PATCH(patch({}), {})).status).toBe(400);
  });

  it('trims whitespace', async () => {
    await PATCH(patch({ lastName: '  Hopper  ' }), {});
    expect(h.userUpdate.mock.calls[0][0].data.lastName).toBe('Hopper');
  });
});
