/**
 * Online-class invitations — the missing half of "schedule a class".
 *
 * WHAT WAS BROKEN. Creating a batch generated `LmsScheduledClass` rows and
 * stopped there. Nothing created a MEETING for them and nothing told anybody the
 * class existed, which produced three separate dead ends:
 *
 *  1. No invitation ever reached the teacher or the students. The only class
 *     email in the app is `sendJoinLinkToStudents`, fired from `startClass` — and
 *     it opens with `if (!meeting?.joinUrl) return`, so with no meeting it sent
 *     nothing, silently. The teacher was never emailed at all, by any path.
 *  2. The student calendar gates its Join affordance on `cls.meetingId`
 *     (`app/(learner)/learner/schedule/page.tsx`), which stayed null forever, so
 *     an enrolled student saw the class but had no way into it.
 *  3. The worker's class reminders resolve the join URL through `meetingFor()`
 *     and degraded to a reminder with no link.
 *
 * A meeting only ever came into existence when a TEACHER manually opened
 * "Video class" on one specific class row and picked a provider. Everything
 * downstream — student join button, invitation email, reminder link, parent
 * live-class view — was waiting on that one click, per class, forever.
 *
 * WHY MEETINGS ARE PROVISIONED HERE AND NOT FOR THE WHOLE YEAR. A batch spans an
 * academic year, so `generateClasses` legitimately produces hundreds of rows.
 * Zoom and Google Meet cost one authenticated API call each, so minting a
 * year of them inside the create request is not an option. We provision a
 * NEAR-TERM WINDOW (see `MEETING_WINDOW_DAYS` / `MEETING_PROVISION_CAP`) and the
 * existing on-demand paths keep covering the rest: `startClass` now ensures its
 * own meeting, and the teacher's provider picker still works per class.
 *
 * Every function here is best-effort by contract: an invitation that fails must
 * never fail the batch, the enrolment or the class it describes. Failures are
 * logged with the ids needed to retry them by hand.
 */
import type { LmsMeetingProvider as MeetingProvider } from '@prisma/client';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { createMeeting } from './meetings-service';

/**
 * How far ahead of "now" a batch's classes get a meeting up front, and the hard
 * ceiling per invocation.
 *
 * These bound work that happens INSIDE the create/update request. Each class
 * costs a lookup plus a `createMeeting` (which itself reads the teacher and the
 * tenant video config), and Zoom / Google Meet add one authenticated API call —
 * so this is the knob that decides whether saving a batch takes 300ms or 30s. A
 * fortnight covers every realistic schedule shape (weekly → ~2 classes, daily →
 * ~14) while keeping the tail bounded for a batch with several slots a day.
 *
 * Classes beyond the window are NOT left unreachable: `startClass` provisions its
 * own meeting, and the teacher's per-class provider picker still works. The only
 * thing they lack is a join link in the invitation email, which lists them by time
 * regardless.
 */
const MEETING_WINDOW_DAYS = 14;
const MEETING_PROVISION_CAP = 20;
/** Classes listed in an invitation email before it says "+N more". */
const INVITE_CLASS_PREVIEW = 8;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';

/**
 * Providers that can mint a room with no tenant credentials.
 *
 * `createMeeting` throws BadRequest for zoom / google_meet when nothing is
 * configured — correct for the teacher's explicit provider pick, fatal for an
 * automatic provision. So the batch's preferred provider is tried first and
 * jitsi is the fallback: a real, joinable room beats a null `meetingId`.
 */
const SELF_SERVE_PROVIDERS: MeetingProvider[] = ['jitsi'];

export interface ClassRow {
  id: string;
  batchId: string;
  teacherId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string | null;
  meetingId?: string | null;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The `en-IN` long form the other class emails in this app already use. */
function formatClassTime(value: Date | string): string {
  return new Date(value).toLocaleString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Best-effort mail — a failed send must never fail what it was describing. */
async function trySend(to: string, subject: string, html: string): Promise<boolean> {
  try {
    await sendEmail({ to, subject, html });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[class-invite] email send failed (non-fatal) for', to, err);
    return false;
  }
}

/**
 * The meeting for a scheduled class, creating one if it does not exist yet.
 *
 * Resolution order matches `sendJoinLinkToStudents`: the class's own `meetingId`
 * first, then a reverse lookup on `scheduledClassId` (which is back-linked so the
 * next lookup is direct), then creation. Returns null only when creation itself
 * failed — the caller decides whether that is worth aborting for, and no caller
 * currently thinks it is.
 */
export async function ensureClassMeeting(
  orgId: string,
  cls: ClassRow,
  preferredProvider?: MeetingProvider | null,
): Promise<{ id: string; joinUrl: string; hostUrl: string | null; password: string | null } | null> {
  const existing = cls.meetingId
    ? await db.lmsMeeting.findFirst({ where: { id: cls.meetingId, orgId } })
    : null;
  if (existing?.joinUrl) {
    return { id: existing.id, joinUrl: existing.joinUrl, hostUrl: existing.hostUrl, password: existing.password };
  }

  const byClass = await db.lmsMeeting.findFirst({
    where: { orgId, scheduledClassId: cls.id, status: { notIn: ['cancelled'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (byClass?.joinUrl) {
    // Back-link so every later read is a direct hit, as the legacy did.
    await db.lmsScheduledClass
      .update({ where: { id: cls.id }, data: { meetingId: byClass.id } })
      .catch(() => {});
    return { id: byClass.id, joinUrl: byClass.joinUrl, hostUrl: byClass.hostUrl, password: byClass.password };
  }

  // Try the batch's configured provider, then fall back. `createMeeting`
  // already back-links `meetingId` onto the class when `scheduledClassId` is
  // passed, so there is nothing to reconcile here.
  const candidates: MeetingProvider[] = [];
  if (preferredProvider) candidates.push(preferredProvider);
  for (const p of SELF_SERVE_PROVIDERS) if (!candidates.includes(p)) candidates.push(p);

  for (const provider of candidates) {
    try {
      const meeting = await createMeeting(
        orgId,
        {
          scheduledClassId: cls.id,
          title: cls.title,
          scheduledStartTime: new Date(cls.startTime).toISOString(),
          scheduledEndTime: new Date(cls.endTime).toISOString(),
          provider,
        },
        cls.teacherId,
      );
      return {
        id: meeting.id,
        joinUrl: meeting.joinUrl,
        hostUrl: meeting.hostUrl ?? null,
        password: meeting.password ?? null,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[class-invite] provider "${provider}" could not host class ${cls.id}:`, err);
    }
  }

  // eslint-disable-next-line no-console
  console.error(`[class-invite] no provider could create a meeting for class ${cls.id}`);
  return null;
}

/**
 * Give the batch's near-term classes a meeting each, so the invitation below
 * carries a real link and the calendars have something to join.
 *
 * Returns the classes it looked at, each with the meeting it now has (null when
 * provisioning failed for that one — the rest still went out).
 */
export async function provisionBatchMeetings(
  orgId: string,
  batchId: string,
  opts: { windowDays?: number; cap?: number; from?: Date } = {},
): Promise<Array<ClassRow & { meeting: Awaited<ReturnType<typeof ensureClassMeeting>> }>> {
  const batch = await db.lmsBatch.findFirst({
    where: { id: batchId, orgId },
    select: { defaultMeetingProvider: true },
  });

  const from = opts.from ?? new Date();
  const until = new Date(from);
  until.setDate(until.getDate() + (opts.windowDays ?? MEETING_WINDOW_DAYS));

  const classes = await db.lmsScheduledClass.findMany({
    where: {
      orgId,
      batchId,
      status: { notIn: ['cancelled', 'rescheduled', 'completed'] },
      startTime: { gte: from, lte: until },
    },
    orderBy: { startTime: 'asc' },
    take: opts.cap ?? MEETING_PROVISION_CAP,
    select: {
      id: true, batchId: true, teacherId: true, title: true,
      startTime: true, endTime: true, location: true, meetingId: true,
    },
  });

  const out: Array<ClassRow & { meeting: Awaited<ReturnType<typeof ensureClassMeeting>> }> = [];
  for (const cls of classes) {
    // Sequential on purpose: a provider-backed batch would otherwise fire N
    // concurrent Zoom/Meet calls and trip their rate limits.
    const meeting = await ensureClassMeeting(
      orgId,
      cls,
      (batch?.defaultMeetingProvider as MeetingProvider | null) ?? null,
    );
    out.push({ ...cls, meeting });
  }
  return out;
}

interface Recipient {
  id: string;
  email: string;
  firstName: string | null;
}

function classListHtml(
  classes: Array<{ startTime: Date; endTime: Date; location?: string | null; joinUrl?: string | null }>,
): string {
  const shown = classes.slice(0, INVITE_CLASS_PREVIEW);
  const rows = shown
    .map((c) => {
      const when = esc(formatClassTime(c.startTime));
      const where = c.location ? ` · ${esc(c.location)}` : '';
      const link = c.joinUrl
        ? ` — <a href="${esc(c.joinUrl)}" style="color:#4f46e5;">Join</a>`
        : '';
      return `<li style="margin:6px 0;color:#374151;font-size:14px;">${when}${where}${link}</li>`;
    })
    .join('');
  const more =
    classes.length > shown.length
      ? `<li style="margin:6px 0;color:#6b7280;font-size:13px;">+ ${classes.length - shown.length} more session(s) — see your calendar</li>`
      : '';
  return `<ul style="padding-left:18px;margin:12px 0;">${rows}${more}</ul>`;
}

function invitationHtml(params: {
  firstName: string | null;
  heading: string;
  intro: string;
  batchName: string;
  subject: string;
  teacherName: string;
  grade?: string | null;
  classes: Array<{ startTime: Date; endTime: Date; location?: string | null; joinUrl?: string | null }>;
  calendarPath: string;
}): string {
  const calendarUrl = APP_URL ? `${APP_URL}${params.calendarPath}` : '';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:28px;border-radius:10px 10px 0 0;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${esc(params.heading)}</h1>
      </div>
      <div style="background:#f8f9fa;padding:28px;border-radius:0 0 10px 10px;">
        <p style="font-size:16px;color:#333;">Hi ${esc(params.firstName || 'there')},</p>
        <p style="font-size:14px;color:#555;">${esc(params.intro)}</p>
        <div style="background:#fff;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #667eea;">
          <p style="margin:5px 0;color:#555;"><strong>Batch:</strong> ${esc(params.batchName)}</p>
          <p style="margin:5px 0;color:#555;"><strong>Subject:</strong> ${esc(params.subject)}</p>
          ${params.grade ? `<p style="margin:5px 0;color:#555;"><strong>Grade:</strong> ${esc(params.grade)}</p>` : ''}
          <p style="margin:5px 0;color:#555;"><strong>Teacher:</strong> ${esc(params.teacherName)}</p>
        </div>
        <p style="font-size:14px;color:#333;margin-bottom:0;"><strong>Upcoming sessions</strong></p>
        ${classListHtml(params.classes)}
        ${
          calendarUrl
            ? `<div style="text-align:center;margin:24px 0;">
                 <a href="${esc(calendarUrl)}" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:13px 34px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block;">Open my calendar</a>
               </div>`
            : ''
        }
        <p style="font-size:12px;color:#888;">You will get a reminder before each session starts.</p>
      </div>
    </div>`;
}

export interface SendClassInvitationsResult {
  teacherNotified: boolean;
  studentsNotified: number;
  classesCovered: number;
  meetingsProvisioned: number;
}

/**
 * Invite everyone attached to a batch to its upcoming online classes.
 *
 * Called when a batch is created, when its schedule moves, and when students are
 * enrolled into an existing batch — the three moments at which somebody's
 * calendar changes without them being in the room.
 *
 * `studentIds` narrows the fan-out to a specific set (a fresh enrolment into a
 * running batch); omit it to invite the whole roster.
 */
export async function sendClassInvitations(
  orgId: string,
  batchId: string,
  opts: {
    studentIds?: string[];
    /** Pre-provisioned classes from `provisionBatchMeetings`, to avoid re-querying. */
    classes?: Array<ClassRow & { meeting: Awaited<ReturnType<typeof ensureClassMeeting>> }>;
    /** Wording for a schedule CHANGE rather than a first invitation. */
    kind?: 'invitation' | 'update';
    /**
     * Off when only the student roster changed — the teacher's own schedule is
     * unaffected by an enrolment, and "you have been assigned a batch" would be
     * the wrong thing to tell them for the second time.
     */
    notifyTeacher?: boolean;
  } = {},
): Promise<SendClassInvitationsResult> {
  const empty: SendClassInvitationsResult = {
    teacherNotified: false,
    studentsNotified: 0,
    classesCovered: 0,
    meetingsProvisioned: 0,
  };

  const batch = await db.lmsBatch.findFirst({
    where: { id: batchId, orgId },
    select: { id: true, name: true, subject: true, grade: true, teacherId: true, defaultMeetingProvider: true },
  });
  if (!batch) return empty;

  const provisioned = opts.classes ?? (await provisionBatchMeetings(orgId, batchId));
  if (!provisioned.length) return empty;

  const classes = provisioned.map((c) => ({
    startTime: c.startTime,
    endTime: c.endTime,
    location: c.location,
    joinUrl: c.meeting?.joinUrl ?? null,
    hostUrl: c.meeting?.hostUrl ?? c.meeting?.joinUrl ?? null,
  }));
  const meetingsProvisioned = provisioned.filter((c) => c.meeting).length;

  const teacher = await db.lmsUser.findFirst({
    where: { id: batch.teacherId, orgId },
    select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
  });
  const teacherName = teacher ? `${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim() : 'Your Teacher';

  const isUpdate = opts.kind === 'update';
  const subjectLine = isUpdate
    ? `Class schedule updated: ${batch.subject} · ${batch.name}`
    : `You're scheduled: ${batch.subject} · ${batch.name}`;

  const result: SendClassInvitationsResult = {
    teacherNotified: false,
    studentsNotified: 0,
    classesCovered: provisioned.length,
    meetingsProvisioned,
  };

  // ── The teacher. Previously notified by NOTHING, on any path. ──────────────
  // The teacher gets the HOST link where one exists, so they can open the room
  // rather than joining their own class as a participant.
  if (opts.notifyTeacher !== false && teacher?.email && teacher.isActive !== false) {
    result.teacherNotified = await trySend(
      teacher.email,
      subjectLine,
      invitationHtml({
        firstName: teacher.firstName,
        heading: isUpdate ? 'Your class schedule changed' : 'You have been assigned a batch',
        intro: isUpdate
          ? `The schedule for ${batch.name} has been updated. Your upcoming sessions are below.`
          : `You are the teacher for ${batch.name}. Your upcoming sessions are below — the join link opens the online classroom.`,
        batchName: batch.name,
        subject: batch.subject,
        grade: batch.grade,
        teacherName,
        classes: classes.map((c) => ({ ...c, joinUrl: c.hostUrl })),
        calendarPath: '/teacher-dashboard/batches',
      }),
    );
  }

  // ── The enrolled students. ────────────────────────────────────────────────
  //
  // `studentIds: []` means "no students" — a teacher-only announcement, e.g. a
  // teacher swap where the roster's slots did not move. Tested on `!== undefined`
  // rather than `.length`, because an empty array is falsy and would otherwise
  // silently widen to the entire roster, which is the opposite of what it asks for.
  const enrolled =
    opts.studentIds !== undefined && opts.studentIds.length === 0
      ? []
      : await db.lmsBatchStudent.findMany({
          where: { batchId, ...(opts.studentIds ? { studentId: { in: opts.studentIds } } : {}) },
          select: { studentId: true },
        });
  const studentIds = enrolled.map((e) => e.studentId);
  const students: Recipient[] = studentIds.length
    ? await db.lmsUser.findMany({
        where: { id: { in: studentIds }, orgId, isActive: true },
        select: { id: true, email: true, firstName: true },
      })
    : [];

  for (const student of students) {
    if (!student.email) continue;
    const ok = await trySend(
      student.email,
      subjectLine,
      invitationHtml({
        firstName: student.firstName,
        heading: isUpdate ? 'Your class schedule changed' : 'You have a new class',
        intro: isUpdate
          ? `The schedule for ${batch.name} has been updated. Your upcoming sessions are below.`
          : `You have been enrolled in ${batch.name} with ${teacherName}. Your upcoming sessions are below.`,
        batchName: batch.name,
        subject: batch.subject,
        grade: batch.grade,
        teacherName,
        classes,
        calendarPath: '/learner/schedule',
      }),
    );
    if (ok) result.studentsNotified++;
  }

  return result;
}

/**
 * Provision meetings for a batch's upcoming classes and invite everyone, without
 * ever letting either step fail the caller.
 *
 * This is the entry point `batches-service` uses. It is deliberately the only
 * thing wrapped in a catch-all: the batch write has already committed by the time
 * it runs, so throwing here would report a failure for work that succeeded.
 */
export async function announceBatchSchedule(
  orgId: string,
  batchId: string,
  opts: { studentIds?: string[]; kind?: 'invitation' | 'update'; notifyTeacher?: boolean } = {},
): Promise<SendClassInvitationsResult | null> {
  try {
    return await sendClassInvitations(orgId, batchId, opts);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[class-invite] failed to announce schedule for batch ${batchId}:`, err);
    return null;
  }
}
