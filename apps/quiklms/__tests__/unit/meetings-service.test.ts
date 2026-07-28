/**
 * GAP_REPORT §3.2 meetings — the non-webhook findings:
 *  - "POST /meetings/:id/join: deviceType is now cast to a Prisma enum, so any
 *     value outside LmsDeviceType 500s where the original stored it happily."
 *  - "Reproduced: /meetings/:id/leave still has no tenant scoping."
 *
 * Plus a cross-tenant bug neither the report nor the legacy caught: the webhook
 * participant handlers resolved the learner with a GLOBAL `{ email }` lookup, so
 * the same address in two tenants attached attendance to the wrong org's user.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  meetingFindFirst: vi.fn(),
  meetingUpdate: vi.fn(),
  attendanceFindFirst: vi.fn(),
  attendanceCreate: vi.fn(),
  attendanceUpdate: vi.fn(),
  attendanceFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsMeeting: { findFirst: h.meetingFindFirst, update: h.meetingUpdate },
    lmsMeetingAttendance: {
      findFirst: h.attendanceFindFirst,
      create: h.attendanceCreate,
      update: h.attendanceUpdate,
      findMany: h.attendanceFindMany,
    },
    lmsUser: { findFirst: h.userFindFirst, findUnique: h.userFindUnique },
    lmsTenant: { findUnique: vi.fn() },
  },
}));

import { joinMeeting, leaveMeeting, handleZoomWebhook } from '@/lib/services/meetings-service';

const MEETING = { id: 'm1', orgId: 'org-1', status: 'started', externalMeetingId: '999', joinUrl: 'https://z/j', password: null };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.meetingFindFirst.mockResolvedValue(MEETING);
  h.meetingUpdate.mockResolvedValue(MEETING);
  h.attendanceFindFirst.mockResolvedValue(null);
  h.attendanceCreate.mockImplementation(async ({ data }: any) => ({ id: 'att1', ...data }));
  h.attendanceUpdate.mockImplementation(async ({ data }: any) => ({ id: 'att1', joinedAt: new Date(), ...data }));
  h.attendanceFindMany.mockResolvedValue([]);
  h.userFindFirst.mockResolvedValue({ id: 'u1', role: 'LEARNER', email: 'ada@test.dev' });
});

describe('joinMeeting — an odd deviceType must not cost the learner the class', () => {
  const join = (device?: string) => joinMeeting('org-1', 'm1', 'u1', 'LEARNER', device);

  it.each(['desktop', 'mobile', 'tablet', 'unknown'])('stores the valid enum value %s', async (device) => {
    await join(device);
    expect(h.attendanceCreate.mock.calls[0][0].data.deviceType).toBe(device);
  });

  it('degrades an unrecognised value to unknown instead of 500ing', async () => {
    await expect(join('iPhone 15 Pro')).resolves.toBeDefined();
    expect(h.attendanceCreate.mock.calls[0][0].data.deviceType).toBe('unknown');
  });

  it('normalises case, so "Mobile" is not silently lost', async () => {
    await join('Mobile');
    expect(h.attendanceCreate.mock.calls[0][0].data.deviceType).toBe('mobile');
  });

  it('defaults to unknown when omitted', async () => {
    await join(undefined);
    expect(h.attendanceCreate.mock.calls[0][0].data.deviceType).toBe('unknown');
  });

  it('does not let a crafted value reach Prisma raw', async () => {
    await join("desktop'; DROP TABLE users;--");
    expect(h.attendanceCreate.mock.calls[0][0].data.deviceType).toBe('unknown');
  });
});

describe('leaveMeeting — tenant scoping', () => {
  it('records the leave for a meeting in the caller’s own org', async () => {
    h.attendanceFindFirst.mockResolvedValue({ id: 'att1', joinedAt: new Date(Date.now() - 600_000), joinLeaveHistory: [] });
    const out = await leaveMeeting('m1', 'u1', 'org-1');
    expect(out).not.toBeNull();
    expect(h.attendanceUpdate).toHaveBeenCalled();
  });

  it('404s a meeting belonging to another tenant instead of decrementing it', async () => {
    h.meetingFindFirst.mockResolvedValue(null); // not found within org-2
    await expect(leaveMeeting('m1', 'u1', 'org-2')).rejects.toMatchObject({ statusCode: 404 });
    expect(h.attendanceUpdate).not.toHaveBeenCalled();
    expect(h.meetingUpdate).not.toHaveBeenCalled();
  });

  it('scopes the lookup by org', async () => {
    h.attendanceFindFirst.mockResolvedValue({ id: 'att1', joinedAt: new Date(), joinLeaveHistory: [] });
    await leaveMeeting('m1', 'u1', 'org-1');
    expect(h.meetingFindFirst.mock.calls[0][0].where).toMatchObject({ id: 'm1', orgId: 'org-1' });
  });

  it('skips the org check on the internal webhook path, where the meeting is already resolved', async () => {
    h.attendanceFindFirst.mockResolvedValue({ id: 'att1', joinedAt: new Date(), joinLeaveHistory: [] });
    await leaveMeeting('m1', 'u1');
    expect(h.meetingFindFirst).not.toHaveBeenCalled();
  });

  it('returns null when the participant was never in the meeting', async () => {
    h.attendanceFindFirst.mockResolvedValue(null);
    expect(await leaveMeeting('m1', 'u1', 'org-1')).toBeNull();
  });
});

describe('webhook participant handlers — resolve the learner within the meeting’s org', () => {
  it('scopes the email lookup by the meeting’s orgId', async () => {
    await handleZoomWebhook('meeting.participant_joined', {
      object: { id: '999', participant: { email: 'ada@test.dev' } },
    });
    // A bare { email } lookup is global — two tenants sharing an address would
    // attach attendance to whichever row came back first.
    expect(h.userFindFirst).toHaveBeenCalledWith({ where: { email: 'ada@test.dev', orgId: 'org-1' } });
  });

  it('does nothing when that email has no user inside the meeting’s org', async () => {
    h.userFindFirst.mockResolvedValue(null);
    await handleZoomWebhook('meeting.participant_joined', {
      object: { id: '999', participant: { email: 'stranger@other.test' } },
    });
    expect(h.attendanceCreate).not.toHaveBeenCalled();
  });
});
