/**
 * GAP_REPORT §3.2 meetings — "Zoom and Google Meet meeting creation are
 * unmigrated — unconditional 400. Tenant-level Zoom credentials are gone
 * entirely."
 *
 * Built against Zoom's Server-to-Server OAuth flow. The HTTP layer is stubbed,
 * but the REQUESTS are asserted — grant type, Basic auth, endpoint, and the
 * meeting body — so a wrong call shape fails here rather than at 9am against a
 * live class.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));

import { ZoomProvider, resolveZoomProvider, __clearZoomTokenCache } from '@/lib/integrations/zoom-provider';

const fetchMock = vi.fn();

const tokenOk = () => ({ ok: true, json: async () => ({ access_token: 'tok-1', expires_in: 3600 }) });
const meetingOk = () => ({
  ok: true,
  json: async () => ({ id: 987654321, join_url: 'https://zoom.us/j/987', start_url: 'https://zoom.us/s/987', password: 'pw1' }),
});

const OPTS = { topic: 'Ada — Fire Safety', startTime: new Date('2026-03-01T10:00:00.000Z'), duration: 45 };

beforeEach(() => {
  fetchMock.mockReset();
  __clearZoomTokenCache();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.ZOOM_ACCOUNT_ID;
  delete process.env.ZOOM_CLIENT_ID;
  delete process.env.ZOOM_CLIENT_SECRET;
});
afterEach(() => vi.unstubAllGlobals());

describe('ZoomProvider.createMeeting', () => {
  it('authenticates with account_credentials and Basic auth', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(meetingOk());
    await new ZoomProvider('acct', 'cid', 'secret').createMeeting(OPTS);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://zoom.us/oauth/token');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('cid:secret').toString('base64')}`);
    expect(init.body).toBe('grant_type=account_credentials&account_id=acct');
  });

  it('creates the meeting and maps Zoom’s response onto our shape', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(meetingOk());
    const out = await new ZoomProvider('a', 'c', 's').createMeeting(OPTS);

    expect(out).toEqual({
      externalMeetingId: '987654321', // string, not number — the column is text
      joinUrl: 'https://zoom.us/j/987',
      hostUrl: 'https://zoom.us/s/987',
      password: 'pw1',
    });
  });

  it('sends the meeting body Zoom expects', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(meetingOk());
    await new ZoomProvider('a', 'c', 's').createMeeting(OPTS);

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://api.zoom.us/v2/users/me/meetings');
    expect(init.headers.Authorization).toBe('Bearer tok-1');

    const body = JSON.parse(init.body);
    expect(body.topic).toBe('Ada — Fire Safety');
    expect(body.type).toBe(2); // scheduled
    expect(body.duration).toBe(45);
    expect(body.timezone).toBe('UTC');
    // Zoom rejects millisecond precision on start_time.
    expect(body.start_time).toBe('2026-03-01T10:00:00Z');
    expect(body.settings).toMatchObject({ join_before_host: true, waiting_room: false, auto_recording: 'none' });
  });

  it('turns on cloud recording when the tenant enabled auto-record', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(meetingOk());
    await new ZoomProvider('a', 'c', 's').createMeeting({ ...OPTS, settings: { auto_recording: 'cloud' } });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).settings.auto_recording).toBe('cloud');
  });

  it('reuses a cached token instead of re-authenticating every call', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(meetingOk())
      .mockResolvedValueOnce(meetingOk());

    const p = new ZoomProvider('a', 'c', 's');
    await p.createMeeting(OPTS);
    await p.createMeeting(OPTS);

    const tokenCalls = fetchMock.mock.calls.filter((c) => c[0] === 'https://zoom.us/oauth/token');
    expect(tokenCalls).toHaveLength(1);
  });

  it('does NOT share a token between different credential sets', async () => {
    fetchMock.mockResolvedValue(tokenOk());
    fetchMock
      .mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(meetingOk())
      .mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(meetingOk());

    await new ZoomProvider('tenantA', 'c1', 's1').createMeeting(OPTS);
    await new ZoomProvider('tenantB', 'c2', 's2').createMeeting(OPTS);

    const tokenCalls = fetchMock.mock.calls.filter((c) => c[0] === 'https://zoom.us/oauth/token');
    expect(tokenCalls).toHaveLength(2); // one per tenant — never cross-tenant reuse
  });

  it('throws with Zoom’s reason when authentication fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ reason: 'Invalid client' }) });
    await expect(new ZoomProvider('a', 'c', 's').createMeeting(OPTS)).rejects.toThrow(/Zoom authentication failed/);
  });

  it('throws when meeting creation fails', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Meeting limit reached' }) });
    await expect(new ZoomProvider('a', 'c', 's').createMeeting(OPTS)).rejects.toThrow(/Meeting limit reached/);
  });
});

describe('resolveZoomProvider — tenant credentials beat the global env', () => {
  it('prefers tenant-level Video Settings credentials', async () => {
    process.env.ZOOM_ACCOUNT_ID = 'global-acct';
    process.env.ZOOM_CLIENT_ID = 'global-cid';
    process.env.ZOOM_CLIENT_SECRET = 'global-secret';

    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(meetingOk());
    const p = resolveZoomProvider({ accountId: 't-acct', clientId: 't-cid', clientSecret: 't-secret' })!;
    await p.createMeeting(OPTS);

    expect(fetchMock.mock.calls[0][1].body).toContain('account_id=t-acct');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from('t-cid:t-secret').toString('base64')}`);
  });

  it('falls back to the global env when the tenant has none', async () => {
    process.env.ZOOM_ACCOUNT_ID = 'global-acct';
    process.env.ZOOM_CLIENT_ID = 'global-cid';
    process.env.ZOOM_CLIENT_SECRET = 'global-secret';

    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(meetingOk());
    await resolveZoomProvider(null)!.createMeeting(OPTS);
    expect(fetchMock.mock.calls[0][1].body).toContain('account_id=global-acct');
  });

  it('ignores a partial tenant config rather than sending half-credentials', async () => {
    process.env.ZOOM_ACCOUNT_ID = 'global-acct';
    process.env.ZOOM_CLIENT_ID = 'global-cid';
    process.env.ZOOM_CLIENT_SECRET = 'global-secret';

    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(meetingOk());
    // clientSecret missing — must not be used.
    await resolveZoomProvider({ accountId: 't-acct', clientId: 't-cid' })!.createMeeting(OPTS);
    expect(fetchMock.mock.calls[0][1].body).toContain('account_id=global-acct');
  });

  it('returns null when nothing is configured, so the caller can 400', () => {
    expect(resolveZoomProvider(null)).toBeNull();
    expect(resolveZoomProvider({})).toBeNull();
  });
});
