/**
 * `createMeeting` provider wiring — GAP_REPORT §3.2 meetings: "Zoom and Google
 * Meet meeting creation are unmigrated — unconditional 400. Tenant-level Zoom
 * credentials are gone entirely."
 *
 * The providers have their own suites; this pins the SERVICE's contract with
 * them: precedence, the Zoom-only teacher-name topic, auto-record, duration, and
 * that an unconfigured provider still 400s the way the legacy did.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  resolveZoomProvider: vi.fn(),
  resolveGoogleMeetProvider: vi.fn(),
  zoomCreate: vi.fn(),
  meetCreate: vi.fn(),
  tenantFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  meetingCreate: vi.fn(),
  classUpdate: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/integrations/zoom-provider', () => ({ resolveZoomProvider: h.resolveZoomProvider }));
vi.mock('@/lib/integrations/google-meet-provider', () => ({ resolveGoogleMeetProvider: h.resolveGoogleMeetProvider }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    lmsTenant: { findUnique: h.tenantFindUnique },
    lmsUser: { findUnique: h.userFindUnique },
    lmsMeeting: { create: h.meetingCreate },
    lmsScheduledClass: { update: h.classUpdate },
  },
}));

import { createMeeting } from '@/lib/services/meetings-service';

const DTO = {
  provider: 'zoom' as const,
  title: 'Fire Safety',
  scheduledStartTime: '2026-03-01T10:00:00.000Z',
  scheduledEndTime: '2026-03-01T11:00:00.000Z',
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.userFindUnique.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
  h.tenantFindUnique.mockResolvedValue({ videoConfig: {} });
  h.meetingCreate.mockImplementation(async ({ data }: any) => ({ id: 'm1', ...data }));
  h.classUpdate.mockResolvedValue({});
  h.zoomCreate.mockResolvedValue({ externalMeetingId: '999', joinUrl: 'https://zoom.us/j/999', hostUrl: 'https://zoom.us/s/999', password: 'pw' });
  h.meetCreate.mockResolvedValue({ externalMeetingId: 'evt-1', joinUrl: 'https://meet.google.com/abc', hostUrl: 'https://meet.google.com/abc' });
  h.resolveZoomProvider.mockReturnValue({ createMeeting: h.zoomCreate });
  h.resolveGoogleMeetProvider.mockReturnValue({ createMeeting: h.meetCreate });
});

describe('createMeeting — zoom', () => {
  it('creates a real Zoom meeting and stores its urls', async () => {
    const out = await createMeeting('org-1', DTO as never, 'teacher1');
    expect(h.zoomCreate).toHaveBeenCalled();
    expect(h.meetingCreate.mock.calls[0][0].data).toMatchObject({
      provider: 'zoom',
      externalMeetingId: '999',
      joinUrl: 'https://zoom.us/j/999',
      hostUrl: 'https://zoom.us/s/999',
    });
    expect(out).toBeDefined();
  });

  it('passes the tenant’s Zoom credentials through, so they win over the env', async () => {
    const zoom = { accountId: 'a', clientId: 'c', clientSecret: 's' };
    h.tenantFindUnique.mockResolvedValue({ videoConfig: { zoom } });
    await createMeeting('org-1', DTO as never, 'teacher1');
    expect(h.resolveZoomProvider).toHaveBeenCalledWith(zoom);
  });

  it('prefixes the Zoom topic with the teacher’s name, but not the stored title', async () => {
    await createMeeting('org-1', DTO as never, 'teacher1');
    expect(h.zoomCreate.mock.calls[0][0].topic).toBe('Ada Lovelace — Fire Safety');
    // The room title carries the teacher; the record does not.
    expect(h.meetingCreate.mock.calls[0][0].data.title).toBe('Fire Safety');
  });

  it('computes duration from the scheduled window', async () => {
    await createMeeting('org-1', DTO as never, 'teacher1');
    expect(h.zoomCreate.mock.calls[0][0].duration).toBe(60);
  });

  it('requests cloud recording when the tenant enabled auto-record', async () => {
    h.tenantFindUnique.mockResolvedValue({ videoConfig: { meetingSettings: { autoRecord: true } } });
    await createMeeting('org-1', DTO as never, 'teacher1');
    expect(h.zoomCreate.mock.calls[0][0].settings).toEqual({ auto_recording: 'cloud' });
    expect(h.meetingCreate.mock.calls[0][0].data.recordingEnabled).toBe(true);
  });

  it('leaves recording off by default', async () => {
    await createMeeting('org-1', DTO as never, 'teacher1');
    expect(h.zoomCreate.mock.calls[0][0].settings).toBeUndefined();
  });

  it('400s when Zoom is not configured — the legacy message', async () => {
    h.resolveZoomProvider.mockReturnValue(null);
    await expect(createMeeting('org-1', DTO as never, 'teacher1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Zoom is not configured. Please add Zoom credentials in Video Settings.',
    });
    expect(h.meetingCreate).not.toHaveBeenCalled();
  });

  it('400s with Zoom’s own reason on a provider failure, not an opaque 500', async () => {
    h.zoomCreate.mockRejectedValue(new Error('Meeting limit reached'));
    await expect(createMeeting('org-1', DTO as never, 'teacher1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Zoom error: Meeting limit reached',
    });
    // No orphan row for a meeting that was never created upstream.
    expect(h.meetingCreate).not.toHaveBeenCalled();
  });
});

describe('createMeeting — google meet', () => {
  const MEET_DTO = { ...DTO, provider: 'google_meet' as const };

  it('creates a real Meet link and stores it', async () => {
    await createMeeting('org-1', MEET_DTO as never, 'teacher1');
    expect(h.meetCreate).toHaveBeenCalled();
    expect(h.meetingCreate.mock.calls[0][0].data).toMatchObject({
      provider: 'google_meet',
      externalMeetingId: 'evt-1',
      joinUrl: 'https://meet.google.com/abc',
    });
  });

  it('does NOT prefix the Meet title with the teacher name — that is Zoom-only', async () => {
    await createMeeting('org-1', MEET_DTO as never, 'teacher1');
    expect(h.meetCreate.mock.calls[0][0].topic).toBe('Fire Safety');
  });

  it('400s when Google is not configured', async () => {
    h.resolveGoogleMeetProvider.mockReturnValue(null);
    await expect(createMeeting('org-1', MEET_DTO as never, 'teacher1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Google Meet is not configured. Please add Google credentials.',
    });
  });

  it('400s with Google’s reason on failure', async () => {
    h.meetCreate.mockRejectedValue(new Error('calendar quota exceeded'));
    await expect(createMeeting('org-1', MEET_DTO as never, 'teacher1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Google Meet error: calendar quota exceeded',
    });
  });
});

describe('createMeeting — providers that never needed credentials still work', () => {
  it('jitsi still mints a room without touching any provider', async () => {
    await createMeeting('org-1', { ...DTO, provider: 'jitsi' } as never, 'teacher1');
    expect(h.resolveZoomProvider).not.toHaveBeenCalled();
    expect(h.meetingCreate.mock.calls[0][0].data.joinUrl).toContain('/');
  });

  it('manual still requires a join url', async () => {
    await expect(createMeeting('org-1', { ...DTO, provider: 'manual' } as never, 'teacher1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Join URL is required for manual meetings',
    });
  });
});
