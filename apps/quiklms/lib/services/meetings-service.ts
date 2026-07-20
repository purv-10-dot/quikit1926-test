/**
 * Meetings service — ported from NestJS MeetingsService (Mongoose → Prisma).
 *
 * Provider integrations:
 *  - Jitsi / manual are created inline (no external credentials needed).
 *  - Zoom / Google Meet require live external API calls + credentials. Actual
 *    provider dispatch (and Zoom recording polling) lives in the worker (Phase 4);
 *    here we faithfully reproduce the legacy "not configured" BadRequest that the
 *    NestJS service raised when no credentials were present, which is the default.
 *
 * The Zoom webhook handler (DB-only state transitions) is ported in full.
 * Mongo populate() of scheduledClass / host / createdBy / attendee user is
 * reproduced with manual lookups (actor refs are scalar Strings).
 */
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import type { Prisma, LmsMeetingProvider as MeetingProvider, LmsMeetingStatus as MeetingStatus, LmsMeetingAttendanceRole as MeetingAttendanceRole, LmsDeviceType as DeviceType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFound, BadRequest } from '@/lib/http';
import { resolveZoomProvider } from '@/lib/integrations/zoom-provider';
import { resolveGoogleMeetProvider } from '@/lib/integrations/google-meet-provider';

export interface CreateMeetingDto {
  scheduledClassId?: string;
  title?: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  provider?: MeetingProvider;
  joinUrl?: string;
  hostUrl?: string;
  password?: string;
  recordingEnabled?: boolean;
  isInstant?: boolean;
}

const USER_NAME_SELECT = { id: true, firstName: true, lastName: true } as const;

async function userMap(ids: (string | null | undefined)[], select: Prisma.LmsUserSelect = USER_NAME_SELECT) {
  const unique = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const users = await prisma.lmsUser.findMany({ where: { id: { in: unique } }, select });
  return new Map(users.map((u) => [u.id, { _id: u.id, ...(u as Record<string, unknown>) }]));
}

async function classMap(ids: (string | null | undefined)[], select: Prisma.LmsScheduledClassSelect) {
  const unique = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const classes = await prisma.lmsScheduledClass.findMany({ where: { id: { in: unique } }, select });
  return new Map(classes.map((c) => [c.id, { _id: c.id, ...(c as Record<string, unknown>) }]));
}

function isStaff(role: string) {
  return role === 'TEACHER' || role === 'TENANT_ADMIN' || role === 'SUB_ADMIN';
}

// ═══════════════ JITSI (inline provider) ═══════════════
function createJitsiMeeting(topic: string) {
  const domain = process.env.JITSI_DOMAIN || 'meet.jit.si';
  const roomId = `qs-${randomUUID().substring(0, 8)}`;
  const roomName = topic.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').substring(0, 40);
  const fullRoomName = `${roomName}-${roomId}`;
  const joinUrl = `https://${domain}/${fullRoomName}`;
  return { externalMeetingId: fullRoomName, joinUrl, hostUrl: joinUrl, password: undefined as string | undefined };
}

// ═══════════════ CREATE MEETING ═══════════════
export async function createMeeting(orgId: string, dto: CreateMeetingDto, createdBy: string) {
  const provider: MeetingProvider = dto.provider || 'jitsi';

  let teacherName = '';
  try {
    const teacher = await prisma.lmsUser.findUnique({ where: { id: createdBy }, select: { firstName: true, lastName: true } });
    if (teacher) teacherName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
  } catch {
    /* ignore */
  }

  const baseTitle = dto.title || 'Quick Skill Class';
  const title = baseTitle;

  // Zoom shows the room title, so the legacy prefixed the teacher's name:
  // "Teacher Name — Class". Only Zoom gets this; `title` stays clean everywhere
  // else (`meetings.service.ts:70-75`).
  const zoomTopic = teacherName ? `${teacherName} — ${baseTitle}` : baseTitle;

  const duration = Math.ceil(
    (new Date(dto.scheduledEndTime).getTime() - new Date(dto.scheduledStartTime).getTime()) / 60000,
  );

  // Tenant video config: auto-record AND tenant-level Zoom credentials.
  let autoRecord = false;
  let tenantZoom: { accountId?: string; clientId?: string; clientSecret?: string } | null = null;
  try {
    const tenant = await prisma.lmsTenant.findUnique({ where: { id: orgId } });
    const vc = (tenant as Record<string, any> | null)?.videoConfig;
    // The frontend saves under meetingSettings, not settings — both are read.
    if (vc?.meetingSettings?.autoRecord || vc?.settings?.autoRecord) autoRecord = true;
    tenantZoom = vc?.zoom ?? null;
  } catch {
    /* ignore */
  }

  let meetingData: { externalMeetingId?: string; joinUrl: string; hostUrl?: string; password?: string };

  if (provider === 'manual') {
    if (!dto.joinUrl) throw BadRequest('Join URL is required for manual meetings');
    meetingData = { externalMeetingId: 'manual', joinUrl: dto.joinUrl, hostUrl: dto.hostUrl || dto.joinUrl, password: dto.password };
  } else if (provider === 'jitsi') {
    meetingData = createJitsiMeeting(title);
  } else if (provider === 'zoom') {
    // Tenant Video Settings credentials take priority over the global env —
    // legacy precedence (`meetings.service.ts:93-105`).
    const zoom = resolveZoomProvider(tenantZoom);
    if (!zoom) throw BadRequest('Zoom is not configured. Please add Zoom credentials in Video Settings.');
    try {
      meetingData = await zoom.createMeeting({
        topic: zoomTopic,
        startTime: new Date(dto.scheduledStartTime),
        duration: duration || 60,
        settings: autoRecord ? { auto_recording: 'cloud' } : undefined,
      });
    } catch (err) {
      // A provider outage is a 400 with Zoom's own reason attached, as in the
      // legacy — not an opaque 500.
      throw BadRequest(`Zoom error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (provider === 'google_meet') {
    const meet = resolveGoogleMeetProvider();
    if (!meet) throw BadRequest('Google Meet is not configured. Please add Google credentials.');
    try {
      meetingData = await meet.createMeeting({
        topic: title,
        startTime: new Date(dto.scheduledStartTime),
        duration: duration || 60,
      });
    } catch (err) {
      throw BadRequest(`Google Meet error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    throw BadRequest(`Unknown provider "${provider}". Supported: jitsi, zoom, google_meet, manual.`);
  }

  const meeting = await prisma.lmsMeeting.create({
    data: {
      orgId,
      scheduledClassId: dto.scheduledClassId,
      hostId: createdBy,
      provider,
      externalMeetingId: meetingData.externalMeetingId,
      joinUrl: meetingData.joinUrl,
      hostUrl: meetingData.hostUrl,
      password: meetingData.password,
      scheduledStartTime: new Date(dto.scheduledStartTime),
      scheduledEndTime: new Date(dto.scheduledEndTime),
      status: 'scheduled',
      recordingEnabled: autoRecord || !!dto.recordingEnabled,
      createdBy,
      title: dto.title,
      isInstant: !!dto.isInstant,
    },
  });

  if (dto.scheduledClassId) {
    await prisma.lmsScheduledClass.update({ where: { id: dto.scheduledClassId }, data: { meetingId: meeting.id } }).catch(() => {});
  }

  return { _id: meeting.id, ...meeting };
}

// ═══════════════ CREATE INSTANT MEETING ═══════════════
export async function createInstantMeeting(orgId: string, createdBy: string, provider: MeetingProvider, title?: string) {
  const now = new Date();
  const endTime = new Date(now.getTime() + 60 * 60 * 1000);

  const created = await createMeeting(
    orgId,
    { provider, scheduledStartTime: now.toISOString(), scheduledEndTime: endTime.toISOString(), title: title || 'Instant Meeting', isInstant: true },
    createdBy,
  );

  const updated = await prisma.lmsMeeting.update({
    where: { id: created.id },
    data: { status: 'started', actualStartTime: now },
  });
  return { _id: updated.id, ...updated };
}

// ═══════════════ LIST MEETINGS ═══════════════
export async function findAll(orgId: string, filters?: { scheduledClassId?: string; status?: string }) {
  const where: Prisma.LmsMeetingWhereInput = { orgId };
  if (filters?.scheduledClassId) where.scheduledClassId = filters.scheduledClassId;
  if (filters?.status) where.status = filters.status as MeetingStatus;

  const rows = await prisma.lmsMeeting.findMany({ where, orderBy: { scheduledStartTime: 'desc' } });
  const cmap = await classMap(rows.map((r) => r.scheduledClassId), { id: true, title: true, startTime: true, batchId: true });
  const hmap = await userMap([...rows.map((r) => r.hostId), ...rows.map((r) => r.createdBy)]);

  return rows.map((r) => ({
    _id: r.id,
    ...r,
    scheduledClassId: r.scheduledClassId ? cmap.get(r.scheduledClassId) ?? r.scheduledClassId : null,
    hostId: r.hostId ? hmap.get(r.hostId) ?? r.hostId : null,
    createdBy: r.createdBy ? hmap.get(r.createdBy) ?? r.createdBy : null,
  }));
}

// ═══════════════ GET MEETING BY ID ═══════════════
export async function findOne(orgId: string, meetingId: string) {
  const meeting = await prisma.lmsMeeting.findFirst({ where: { id: meetingId, orgId } });
  if (!meeting) throw NotFound('Meeting not found');

  const cmap = await classMap([meeting.scheduledClassId], { id: true, title: true, startTime: true, endTime: true, batchId: true, teacherId: true });
  const hmap = await userMap([meeting.hostId], { id: true, firstName: true, lastName: true, email: true });
  const cbmap = await userMap([meeting.createdBy]);

  return {
    _id: meeting.id,
    ...meeting,
    scheduledClassId: meeting.scheduledClassId ? cmap.get(meeting.scheduledClassId) ?? meeting.scheduledClassId : null,
    hostId: meeting.hostId ? hmap.get(meeting.hostId) ?? meeting.hostId : null,
    createdBy: meeting.createdBy ? cbmap.get(meeting.createdBy) ?? meeting.createdBy : null,
  };
}

// ═══════════════ START MEETING ═══════════════
export async function startMeeting(orgId: string, meetingId: string) {
  const result = await prisma.lmsMeeting.updateMany({
    where: { id: meetingId, orgId, status: 'scheduled' },
    data: { status: 'started', actualStartTime: new Date() },
  });
  if (result.count === 0) throw BadRequest('Meeting not found or cannot be started');
  const m = await prisma.lmsMeeting.findFirst({ where: { id: meetingId, orgId } });
  return { _id: m!.id, ...m };
}

// ═══════════════ END MEETING ═══════════════
export async function endMeeting(orgId: string, meetingId: string) {
  const result = await prisma.lmsMeeting.updateMany({
    where: { id: meetingId, orgId, status: 'started' },
    data: { status: 'ended', actualEndTime: new Date() },
  });
  if (result.count === 0) throw BadRequest('Meeting not found or not started');
  await calculateAttendanceDurations(meetingId);
  const m = await prisma.lmsMeeting.findFirst({ where: { id: meetingId, orgId } });
  return { _id: m!.id, ...m };
}

// ═══════════════ CANCEL MEETING ═══════════════
export async function cancelMeeting(orgId: string, meetingId: string) {
  const result = await prisma.lmsMeeting.updateMany({
    where: { id: meetingId, orgId, status: { in: ['scheduled', 'started'] } },
    data: { status: 'cancelled' },
  });
  if (result.count === 0) throw BadRequest('Meeting not found or cannot be cancelled');
  const m = await prisma.lmsMeeting.findFirst({ where: { id: meetingId, orgId } });
  return { _id: m!.id, ...m };
}

// ═══════════════ TOGGLE RECORDING ═══════════════
export async function toggleRecording(orgId: string, meetingId: string, enabled: boolean) {
  const existing = await prisma.lmsMeeting.findFirst({ where: { id: meetingId, orgId } });
  if (!existing) throw NotFound('Meeting not found');
  const m = await prisma.lmsMeeting.update({ where: { id: meetingId }, data: { recordingEnabled: enabled } });
  return { _id: m.id, ...m };
}

// ═══════════════ GET RECORDINGS ═══════════════
export async function getRecordings(orgId: string, meetingId: string) {
  const meeting = await prisma.lmsMeeting.findFirst({ where: { id: meetingId, orgId } });
  if (!meeting) throw NotFound('Meeting not found');
  return {
    meetingId: meeting.id,
    title: meeting.title,
    recordingStatus: meeting.recordingStatus,
    recordingUrls: meeting.recordingUrls || [],
    recordingEnabled: meeting.recordingEnabled,
  };
}

// ═══════════════ GET ALL RECORDINGS FOR TENANT ═══════════════
export async function getAllRecordings(orgId: string, filters?: { status?: string; limit?: number }) {
  const where: Prisma.LmsMeetingWhereInput = { orgId, NOT: { recordingUrls: { isEmpty: true } } };
  if (filters?.status) where.recordingStatus = filters.status as Prisma.LmsMeetingWhereInput['recordingStatus'];

  const rows = await prisma.lmsMeeting.findMany({
    where,
    orderBy: { actualEndTime: 'desc' },
    take: filters?.limit || 50,
    select: {
      id: true, title: true, scheduledStartTime: true, actualStartTime: true, actualEndTime: true,
      recordingUrls: true, recordingStatus: true, hostId: true, scheduledClassId: true, provider: true,
    },
  });
  const cmap = await classMap(rows.map((r) => r.scheduledClassId), { id: true, title: true, startTime: true, batchId: true });
  const hmap = await userMap(rows.map((r) => r.hostId));

  return rows.map((r) => ({
    _id: r.id,
    ...r,
    scheduledClassId: r.scheduledClassId ? cmap.get(r.scheduledClassId) ?? r.scheduledClassId : null,
    hostId: r.hostId ? hmap.get(r.hostId) ?? r.hostId : null,
  }));
}

// ═══════════════ JOIN MEETING (LOG ATTENDANCE) ═══════════════
/**
 * Coerce a client-supplied deviceType to the `LmsDeviceType` enum.
 *
 * Mongo stored whatever string arrived; Postgres has an enum, so the port's bare
 * `deviceType as DeviceType` cast made any unrecognised value — an old client, a
 * typo, "iPhone" — **500 the join** (GAP_REPORT §3.2 meetings). Losing the
 * analytics label for one attendee must never cost them the class, so an unknown
 * value degrades to 'unknown' instead.
 */
function normalizeDeviceType(value?: string): DeviceType {
  const v = (value || '').trim().toLowerCase();
  return (['desktop', 'mobile', 'tablet', 'unknown'] as const).includes(v as DeviceType)
    ? (v as DeviceType)
    : 'unknown';
}

export async function joinMeeting(orgId: string, meetingId: string, userId: string, role: string, deviceType?: string) {
  const meeting = await prisma.lmsMeeting.findFirst({ where: { id: meetingId, orgId } });
  if (!meeting) throw NotFound('Meeting not found');

  const existing = await prisma.lmsMeetingAttendance.findFirst({
    where: { meetingId, userId, leftAt: null },
  });
  if (existing) return { alreadyJoined: true, attendance: { _id: existing.id, ...existing } };

  const now = new Date();
  const attendance = await prisma.lmsMeetingAttendance.create({
    data: {
      meetingId,
      userId,
      role: (isStaff(role) ? 'teacher' : 'student') as MeetingAttendanceRole,
      joinedAt: now,
      deviceType: normalizeDeviceType(deviceType),
      joinLeaveHistory: [{ action: 'join', timestamp: now.toISOString() }],
    },
  });

  await prisma.lmsMeeting.update({ where: { id: meetingId }, data: { participantCount: { increment: 1 } } });

  return {
    attendance: { _id: attendance.id, ...attendance },
    joinUrl: meeting.joinUrl,
    hostUrl: isStaff(role) ? meeting.hostUrl : undefined,
  };
}

// ═══════════════ LEAVE MEETING ═══════════════
/**
 * Record a participant leaving.
 *
 * `orgId` is REQUIRED and enforced (the legacy scoped nothing here, and the port
 * reproduced that). Without it, `participantCount` on any tenant's meeting could
 * be decremented by id alone. Pass null only from the internal webhook path,
 * where the meeting has already been resolved and the org is implicit.
 */
export async function leaveMeeting(meetingId: string, userId: string, orgId?: string | null) {
  const now = new Date();
  if (orgId) {
    const meeting = await prisma.lmsMeeting.findFirst({ where: { id: meetingId, orgId }, select: { id: true } });
    if (!meeting) throw NotFound('Meeting not found');
  }
  const attendance = await prisma.lmsMeetingAttendance.findFirst({ where: { meetingId, userId, leftAt: null } });
  if (!attendance) return null;

  const history = Array.isArray(attendance.joinLeaveHistory) ? (attendance.joinLeaveHistory as unknown[]) : [];
  const duration = Math.round((now.getTime() - new Date(attendance.joinedAt).getTime()) / 60000);
  const updated = await prisma.lmsMeetingAttendance.update({
    where: { id: attendance.id },
    data: { leftAt: now, durationMinutes: duration, joinLeaveHistory: [...history, { action: 'leave', timestamp: now.toISOString() }] as Prisma.InputJsonValue },
  });
  await prisma.lmsMeeting.update({ where: { id: meetingId }, data: { participantCount: { decrement: 1 } } });
  return { _id: updated.id, ...updated };
}

// ═══════════════ GET MEETING ATTENDANCE ═══════════════
export async function getMeetingAttendance(orgId: string, meetingId: string) {
  const meeting = await prisma.lmsMeeting.findFirst({ where: { id: meetingId, orgId } });
  if (!meeting) throw NotFound('Meeting not found');

  const rows = await prisma.lmsMeetingAttendance.findMany({ where: { meetingId }, orderBy: { joinedAt: 'asc' } });
  const umap = await userMap(rows.map((r) => r.userId), { id: true, firstName: true, lastName: true, email: true, role: true });
  return rows.map((r) => ({ _id: r.id, ...r, userId: umap.get(r.userId) ?? r.userId }));
}

// ═══════════════ ATTENDANCE DURATION HELPER ═══════════════
async function calculateAttendanceDurations(meetingId: string) {
  const now = new Date();
  const open = await prisma.lmsMeetingAttendance.findMany({ where: { meetingId, leftAt: null } });
  for (const att of open) {
    const history = Array.isArray(att.joinLeaveHistory) ? (att.joinLeaveHistory as unknown[]) : [];
    const duration = Math.round((now.getTime() - new Date(att.joinedAt).getTime()) / 60000);
    await prisma.lmsMeetingAttendance.update({
      where: { id: att.id },
      data: { leftAt: now, durationMinutes: duration, joinLeaveHistory: [...history, { action: 'leave', timestamp: now.toISOString() }] as Prisma.InputJsonValue },
    });
  }
}

// ═══════════════ WEBHOOK: ZOOM ═══════════════
export function verifyZoomUrlValidation(plainToken: string) {
  const hashForValidate = createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '')
    .update(plainToken || '')
    .digest('hex');
  return { plainToken, encryptedToken: hashForValidate };
}

/** Reject replayed events older than this (Zoom's own guidance). */
const ZOOM_WEBHOOK_MAX_SKEW_MS = 5 * 60_000;

/**
 * Verify a Zoom webhook's `x-zm-signature` — BUILT, not ported. The NestJS
 * original never verified anything: it took an `authHeader` param it did not
 * check, so the endpoint accepted any POST from anyone (GAP_REPORT §3.2 meetings).
 *
 * That is not a theoretical hole. `handleZoomWebhook` looks meetings up by
 * `externalMeetingId` with **no orgId**, so a forged `meeting.ended` or
 * `recording.completed` could end — or attach arbitrary recording URLs to — ANY
 * tenant's meeting. The migration was the moment to fix it.
 *
 * Zoom's documented scheme: `HMAC-SHA256(secret, "v0:{timestamp}:{rawBody}")`,
 * compared against the `x-zm-signature` header as `v0={hash}`.
 *
 * FAILS CLOSED. With no `ZOOM_WEBHOOK_SECRET_TOKEN` configured, every event is
 * rejected rather than waved through — an unverifiable webhook that mutates
 * meetings across tenants is worse than one that is switched off.
 */
export function verifyZoomWebhookSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  now: number = Date.now(),
): boolean {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret || !signature || !timestamp) return false;

  // Replay window.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Zoom sends epoch milliseconds.
  if (Math.abs(now - ts) > ZOOM_WEBHOOK_MAX_SKEW_MS) return false;

  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;

  // Constant-time compare — a length-sensitive `===` leaks the signature byte by byte.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function handleZoomWebhook(event: string, payload: Record<string, any>) {
  if (event === 'meeting.ended') {
    const meetingId = String(payload?.object?.id);
    const meeting = await prisma.lmsMeeting.findFirst({ where: { externalMeetingId: meetingId } });
    if (meeting && meeting.status === 'started') {
      await prisma.lmsMeeting.update({ where: { id: meeting.id }, data: { status: 'ended', actualEndTime: new Date() } });
      await calculateAttendanceDurations(meeting.id);
    }
  }

  if (event === 'meeting.participant_joined') {
    const meetingId = String(payload?.object?.id);
    const participantEmail = payload?.object?.participant?.email;
    if (participantEmail) await handleWebhookParticipantJoin(meetingId, participantEmail);
  }

  if (event === 'meeting.participant_left') {
    const meetingId = String(payload?.object?.id);
    const participantEmail = payload?.object?.participant?.email;
    if (participantEmail) await handleWebhookParticipantLeave(meetingId, participantEmail);
  }

  if (event === 'recording.completed') {
    const meetingId = String(payload?.object?.id);
    const recordingFiles: Record<string, any>[] = payload?.object?.recording_files || [];

    const EXCLUDED_TYPES = ['chat_file', 'timeline', 'transcript', 'closed_caption'];
    const urls = recordingFiles
      .filter((f) => f.status === 'completed' && !EXCLUDED_TYPES.includes(f.recording_type))
      .map((f) => f.play_url || f.download_url)
      .filter(Boolean);

    const finalUrls =
      urls.length > 0
        ? urls
        : recordingFiles.filter((f) => f.status === 'completed').map((f) => f.play_url || f.download_url).filter(Boolean);

    if (finalUrls.length > 0) {
      const meeting = await prisma.lmsMeeting.findFirst({ where: { externalMeetingId: meetingId } });
      if (meeting) {
        await prisma.lmsMeeting.update({ where: { id: meeting.id }, data: { recordingUrls: finalUrls, recordingStatus: 'available' } });
      }
    }
  }

  return { received: true };
}

async function handleWebhookParticipantJoin(externalMeetingId: string, email: string) {
  try {
    const meeting = await prisma.lmsMeeting.findFirst({ where: { externalMeetingId } });
    if (!meeting) return;
    // Scoped to the MEETING's org. A bare `{ email }` lookup is global, so the
    // same address existing in two tenants would attach this attendance to
    // whichever row Postgres returned first — the wrong tenant's user.
    const user = await prisma.lmsUser.findFirst({ where: { email, orgId: meeting.orgId } });
    if (!user) return;

    const existing = await prisma.lmsMeetingAttendance.findFirst({ where: { meetingId: meeting.id, userId: user.id, leftAt: null } });
    if (!existing) {
      const now = new Date();
      await prisma.lmsMeetingAttendance.create({
        data: {
          meetingId: meeting.id,
          userId: user.id,
          role: (user.role === 'TEACHER' ? 'teacher' : 'student') as MeetingAttendanceRole,
          joinedAt: now,
          joinLeaveHistory: [{ action: 'join', timestamp: now.toISOString() }],
        },
      });
      await prisma.lmsMeeting.update({ where: { id: meeting.id }, data: { participantCount: { increment: 1 } } });
    }
  } catch {
    /* ignore webhook errors, matching legacy resilience */
  }
}

async function handleWebhookParticipantLeave(externalMeetingId: string, email: string) {
  try {
    const meeting = await prisma.lmsMeeting.findFirst({ where: { externalMeetingId } });
    if (!meeting) return;
    // Scoped to the MEETING's org. A bare `{ email }` lookup is global, so the
    // same address existing in two tenants would attach this attendance to
    // whichever row Postgres returned first — the wrong tenant's user.
    const user = await prisma.lmsUser.findFirst({ where: { email, orgId: meeting.orgId } });
    if (!user) return;
    await leaveMeeting(meeting.id, user.id);
  } catch {
    /* ignore */
  }
}

// ═══════════════ LIVE CLASS STATUS (for parents) ═══════════════
export async function getLiveClassStatus(orgId: string, studentId: string) {
  const batches = await prisma.lmsBatch.findMany({
    where: { orgId, status: 'active', students: { some: { studentId } } },
    select: { id: true },
  });
  const batchIds = batches.map((b) => b.id);
  if (batchIds.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayClasses = await prisma.lmsScheduledClass.findMany({
    where: { batchId: { in: batchIds }, startTime: { gte: today, lt: tomorrow }, status: { not: 'cancelled' } },
    select: { id: true, startTime: true, endTime: true, status: true, batchId: true, teacherId: true },
  });

  const bmap = new Map(
    (await prisma.lmsBatch.findMany({ where: { id: { in: todayClasses.map((c) => c.batchId) } }, select: { id: true, name: true, subject: true, grade: true } })).map(
      (b) => [b.id, { _id: b.id, ...b }],
    ),
  );
  const tmap = await userMap(todayClasses.map((c) => c.teacherId));

  const results: Record<string, unknown>[] = [];
  for (const cls of todayClasses) {
    const meeting = await prisma.lmsMeeting.findFirst({
      where: { scheduledClassId: cls.id },
      select: { status: true, joinUrl: true, actualStartTime: true, participantCount: true },
    });
    results.push({
      classId: cls.id,
      batch: bmap.get(cls.batchId) ?? cls.batchId,
      teacher: tmap.get(cls.teacherId) ?? cls.teacherId,
      startTime: cls.startTime,
      endTime: cls.endTime,
      classStatus: cls.status,
      meetingStatus: meeting ? meeting.status : 'no_meeting',
      isLive: meeting ? meeting.status === 'started' : false,
      joinUrl: meeting && meeting.status === 'started' ? meeting.joinUrl : null,
      participantCount: meeting ? meeting.participantCount : 0,
      actualStartTime: meeting ? meeting.actualStartTime : null,
    });
  }
  return results;
}
