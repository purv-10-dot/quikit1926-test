/**
 * Course-assignment reminder emails — ported from CourseAssignmentRemindersService.
 *
 * WHY THIS EXISTS. The legacy `handleNewAssignment` (`course-assignment-reminders.service.ts:34-66`)
 * did TWO things per newly-created USER assignment:
 *   1. sent the immediate "ASSIGNED" email, and
 *   2. scheduled day-10 / day-20 BullMQ delayed jobs.
 *
 * (2) is already covered differently: BullMQ is not installed here, and the
 * worker's daily cron finds due reminders by SCANNING `assignedAt` windows
 * (`worker/src/jobs/course-assignment-reminders.ts`) instead of pre-scheduling
 * jobs. That substitution is fine and is left alone.
 *
 * (1) was lost in the migration. The REST layer omitted it "because the worker
 * does it", while the worker's own docblock says *"the immediate reminder is
 * sent at assign time by the REST layer"* — each side assumed the other, so
 * **nobody sent it** and learners were never told a course had been assigned
 * (GAP_REPORT §3.2 course-assignments). This module restores that one email,
 * on the REST side, which is where the worker expects it.
 *
 * The markup is the legacy's, kept verbatim down to the Outlook workarounds:
 * solid background-colors rather than gradients (Outlook/Gmail-app strip
 * gradients, which left white-on-white), and a table-based CTA so the whole
 * button area is clickable.
 */
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

const APP_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://app.quikskill.com';

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface BuildHtmlParams {
  learnerFirstName: string;
  courseTitle: string;
  courseDescription: string;
  dueDateText: string;
  daysRemaining: number | null;
  isMandatory: boolean;
}

/** Port of `buildHtml` for kind='ASSIGNED', dayOffset=0. */
function buildAssignedHtml(p: BuildHtmlParams): string {
  const heading = 'A new training has been assigned to you';
  const subheading = 'Get started today to stay on track';
  const ctaLabel = 'Log in and Start Training';
  const ctaUrl = `${APP_URL}/login`;

  const safeTitle = escapeHtml(p.courseTitle);
  const safeDesc = escapeHtml(p.courseDescription).slice(0, 400);
  const safeFn = escapeHtml(p.learnerFirstName);

  const introText = `You've been assigned a new training course. Please complete it before the due date to stay on track.`;
  const badgeText = 'NEW ASSIGNMENT';

  const mandatoryPill = p.isMandatory
    ? `<span style="display:inline-block;background-color:#fee2e2;color:#991b1b;padding:6px 14px;border-radius:999px;font-size:14px;font-weight:700;">Mandatory</span>`
    : `<span style="display:inline-block;background-color:#e0e7ff;color:#3730a3;padding:6px 14px;border-radius:999px;font-size:14px;font-weight:700;">Optional</span>`;

  const ctaSolid = '#5b6ee5';
  const ctaSolidDark = '#4338ca';
  const headerSolid = '#5b6ee5';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif;background-color:#eef2f7;color:#1f2937;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:16px 12px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background-color:${headerSolid};background-image:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:28px 32px;text-align:center;">
              <div style="display:inline-block;background-color:rgba(255,255,255,0.22);color:#ffffff;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:0.06em;margin-bottom:14px;">${badgeText}</div>
              <h1 style="color:#ffffff;margin:0 0 8px;font-size:28px;font-weight:700;line-height:1.3;">${escapeHtml(heading)}</h1>
              <p style="color:#ffffff;margin:0;font-size:17px;line-height:1.5;opacity:0.95;">${escapeHtml(subheading)}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 36px 8px 36px;">
              <p style="color:#111827;font-size:20px;line-height:1.5;margin:0 0 14px;font-weight:600;">Hi ${safeFn},</p>
              <p style="color:#374151;font-size:17px;line-height:1.7;margin:0 0 20px;">${introText}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 36px 8px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;">
                <tr>
                  <td style="padding:22px 24px 6px 24px;">
                    <p style="color:#6b7280;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px;">Course</p>
                    <h2 style="color:#111827;font-size:22px;font-weight:700;line-height:1.35;margin:0 0 12px;">${safeTitle}</h2>
                    ${safeDesc ? `<p style="color:#4b5563;font-size:16px;line-height:1.65;margin:0 0 14px;">${safeDesc}</p>` : ''}
                    <div style="margin:0 0 4px;">${mandatoryPill}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 24px 20px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;">
                      <tr>
                        <td style="padding:14px 0 6px 0;color:#6b7280;font-size:15px;">Due date</td>
                        <td style="padding:14px 0 6px 0;color:#111827;font-size:16px;font-weight:700;text-align:right;">${escapeHtml(p.dueDateText)}</td>
                      </tr>
                      ${p.daysRemaining !== null ? `
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:15px;border-top:1px dashed #e5e7eb;">Time remaining</td>
                        <td style="padding:8px 0;color:${p.daysRemaining <= 5 ? '#b91c1c' : '#111827'};font-size:16px;font-weight:700;text-align:right;border-top:1px dashed #e5e7eb;">${p.daysRemaining} day${p.daysRemaining === 1 ? '' : 's'}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 36px 8px 36px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" bgcolor="${ctaSolid}" style="background-color:${ctaSolid};border-radius:10px;border:1px solid ${ctaSolidDark};">
                    <a href="${ctaUrl}"
                       style="display:inline-block;background-color:${ctaSolid};color:#ffffff !important;padding:16px 36px;border-radius:10px;text-decoration:none !important;font-weight:700;font-size:18px;font-family:'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1;mso-padding-alt:0;text-align:center;">
                      <span style="color:#ffffff;">${ctaLabel}</span>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 36px 28px 36px;text-align:center;">
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 4px;">Button not working? Use this link:</p>
              <a href="${ctaUrl}" style="color:#5b6ee5;font-size:14px;word-break:break-all;text-decoration:underline;">${ctaUrl}</a>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 36px 28px 36px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:14px;line-height:1.6;margin:0 0 4px;">This is an automated message from <strong style="color:#6b7280;">QuikSkill LMS</strong>.</p>
              <p style="color:#9ca3af;font-size:13px;margin:0;">Please do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send the immediate "course assigned" email for one assignment — port of
 * `sendEmailForAssignment(id, 'ASSIGNED', 0)` (`:90-149`).
 *
 * Returns true when an email was sent, false when it was skipped: assignment
 * gone, learner has no email, or course not found. Each of those is a legacy
 * skip path, not an error.
 *
 * NEVER throws — the caller fires this without awaiting, and the legacy wrapped
 * it in try/catch precisely so a mail failure could not fail the assignment
 * (`:36-40`).
 */
export async function sendAssignmentAssignedEmail(assignmentId: string): Promise<boolean> {
  try {
    const assignment = await prisma.lmsCourseAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return false;

    const learner = await prisma.lmsUser.findUnique({
      where: { id: assignment.targetId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!learner?.email) return false;

    // MasterCourse first, then the legacy Course — the same order the original used.
    let course = await prisma.lmsMasterCourse.findUnique({
      where: { id: assignment.courseId },
      select: { title: true, description: true },
    });
    if (!course) {
      course = await prisma.lmsCourse.findUnique({
        where: { id: assignment.courseId },
        select: { title: true, description: true },
      });
    }
    if (!course) return false;

    const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
    const dueDateText = dueDate
      ? dueDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Not set';
    const daysRemaining = dueDate
      ? Math.max(0, Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000))
      : null;

    await sendEmail({
      to: learner.email,
      subject: `New Training Assigned: ${course.title}`,
      html: buildAssignedHtml({
        learnerFirstName: learner.firstName || 'there',
        courseTitle: course.title,
        courseDescription: course.description || '',
        dueDateText,
        daysRemaining,
        isMandatory: Boolean(assignment.isMandatory),
      }),
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[assignment-reminders] 'assigned' email failed for ${assignmentId}:`, err);
    return false;
  }
}

/**
 * Fire the immediate "assigned" email for each newly created USER assignment —
 * port of the fire-and-forget loop in `assignCourse` (`course-assignments.service.ts:479-486`).
 *
 * Deliberately NOT awaited by the caller's critical path: "Failures here must
 * not block the assignment creation."
 */
export async function handleNewAssignments(assignmentIds: string[]): Promise<void> {
  await Promise.all(assignmentIds.map((id) => sendAssignmentAssignedEmail(id)));
}
