/**
 * Google Meet provider — built to close the "Google Meet meeting creation is
 * unmigrated" half of GAP_REPORT §3.2 meetings.
 *
 * A Meet link is a side effect of inserting a Calendar event with a
 * conferenceData.createRequest, so the test asserts the REQUEST — especially
 * `conferenceDataVersion: 1`, without which Google silently returns an event
 * with no Meet link at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  del: vi.fn(),
  JWT: vi.fn(),
  calendar: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: h.JWT },
    calendar: h.calendar,
  },
}));

import { GoogleMeetProvider, resolveGoogleMeetProvider } from '@/lib/integrations/google-meet-provider';

const OPTS = { topic: 'Fire Safety', startTime: new Date('2026-03-01T10:00:00.000Z'), duration: 60 };

const eventWithMeet = {
  data: {
    id: 'evt-1',
    conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }] },
  },
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.calendar.mockReturnValue({ events: { insert: h.insert, delete: h.del } });
  h.insert.mockResolvedValue(eventWithMeet);
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'svc@proj.iam.gserviceaccount.com';
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = '-----BEGIN KEY-----\\nabc\\n-----END KEY-----';
  delete process.env.GOOGLE_CALENDAR_ID;
});
afterEach(() => {
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
});

describe('GoogleMeetProvider.createMeeting', () => {
  it('returns the Meet link from the created event', async () => {
    const out = await new GoogleMeetProvider('svc@x', 'key').createMeeting(OPTS);
    expect(out).toEqual({
      externalMeetingId: 'evt-1',
      joinUrl: 'https://meet.google.com/abc-defg-hij',
      hostUrl: 'https://meet.google.com/abc-defg-hij',
      password: undefined,
    });
  });

  it('sets conferenceDataVersion — without it Google returns no Meet link', async () => {
    await new GoogleMeetProvider('svc@x', 'key').createMeeting(OPTS);
    expect(h.insert.mock.calls[0][0].conferenceDataVersion).toBe(1);
  });

  it('requests a hangoutsMeet conference for the right window', async () => {
    await new GoogleMeetProvider('svc@x', 'key').createMeeting(OPTS);
    const body = h.insert.mock.calls[0][0].requestBody;
    expect(body.summary).toBe('Fire Safety');
    expect(body.start.dateTime).toBe('2026-03-01T10:00:00.000Z');
    expect(body.end.dateTime).toBe('2026-03-01T11:00:00.000Z'); // +60 min
    expect(body.conferenceData.createRequest.conferenceSolutionKey).toEqual({ type: 'hangoutsMeet' });
    expect(body.conferenceData.createRequest.requestId).toEqual(expect.any(String));
  });

  it('unescapes the \\n sequences env vars carry in the private key', async () => {
    new GoogleMeetProvider('svc@x', 'line1\\nline2');
    expect(h.JWT.mock.calls[0][0].key).toBe('line1\nline2');
  });

  it('requests Calendar scope', async () => {
    new GoogleMeetProvider('svc@x', 'key');
    expect(h.JWT.mock.calls[0][0].scopes).toEqual(['https://www.googleapis.com/auth/calendar']);
  });

  it('defaults to the primary calendar', async () => {
    await new GoogleMeetProvider('svc@x', 'key').createMeeting(OPTS);
    expect(h.insert.mock.calls[0][0].calendarId).toBe('primary');
  });

  it('honours an explicit calendar id', async () => {
    await new GoogleMeetProvider('svc@x', 'key', 'team@group.calendar.google.com').createMeeting(OPTS);
    expect(h.insert.mock.calls[0][0].calendarId).toBe('team@group.calendar.google.com');
  });

  it('falls back to hangoutLink when no video entryPoint is returned', async () => {
    h.insert.mockResolvedValue({ data: { id: 'evt-2', hangoutLink: 'https://meet.google.com/xyz' } });
    const out = await new GoogleMeetProvider('svc@x', 'key').createMeeting(OPTS);
    expect(out.joinUrl).toBe('https://meet.google.com/xyz');
  });

  it('throws when Google returns an event with NO Meet link', async () => {
    // The legacy returned joinUrl:'' here — a meeting row nobody could join.
    h.insert.mockResolvedValue({ data: { id: 'evt-3' } });
    await expect(new GoogleMeetProvider('svc@x', 'key').createMeeting(OPTS)).rejects.toThrow(/Meet link was not created/);
  });
});

describe('resolveGoogleMeetProvider', () => {
  it('builds a provider when the service account is configured', () => {
    expect(resolveGoogleMeetProvider()).toBeInstanceOf(GoogleMeetProvider);
  });

  it('returns null with no credentials, so the caller can 400', () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    expect(resolveGoogleMeetProvider()).toBeNull();
  });

  it('returns null when the private key is missing', () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    expect(resolveGoogleMeetProvider()).toBeNull();
  });
});
