/**
 * Daily-digest email RENDERER (redesigned — detailed per-user breakdown).
 *
 * renderDigestEmail(assembled) → email-client-safe { subject, text, html }.
 * Matches the existing transactional-email convention (lib/notifications/
 * email-templates.ts): <!DOCTYPE>, table-based layout, INLINE styles only
 * (no <style> block, no flex/grid), #1e40af brand header, escHtml() on every
 * dynamic value, safe fallback font stack.
 *
 * ─── REDESIGN (leadership-digest v2) ─────────────────────────────────────────
 * The old summary-only layout (counts by rep / by type / field aggregates) is
 * replaced with DETAILED, per-CRM-user sections. For each rep we render four
 * tables of ACTUAL records logged in the window:
 *   📞 Calls    — Time · Contact · Company · Duration · Outcome · Notes
 *   📧 Emails   — Time · To · Subject · Delivery · Reply Status
 *   🤝 Meetings — Time · Client · Meeting Type · Status · Notes
 *   ✅ Tasks    — Time · Task · Related Record · Status
 * Each empty section shows an honest "No Calls" / "No Emails" / … line, and each
 * user's block ends with a compact count summary (Calls/Emails/Meetings/Tasks/
 * Total). A small org-wide totals strip sits at the very top for a quick glance.
 *
 * HONEST LABELS (data-model constraints, see digest-detail.ts):
 *   - Email "Delivery" shows "Sent" — the model has no real delivery/bounce
 *     tracking, so we never fabricate "Delivered".
 *   - Email "Reply Status" is DERIVED from an inbound message in the same thread.
 *   - Meeting "Status" is the meeting outcome (no dedicated status column exists).
 *
 * sendDigestEmail(assembled) is CODED but the boundary is: it is NEVER fired
 * without explicit approval. (This env's email driver defaults to "console".)
 */

import { sendTransactionalEmail } from "@/lib/services/email/send";
import type { AssembledDigest } from "@/lib/services/notifications/digest-run";
import type {
  UserActivityDetail,
  CallDetail,
  EmailDetail,
  MeetingDetail,
  TaskDetail,
} from "@/lib/services/notifications/digest-detail";
import { MAX_ROWS_PER_SECTION } from "@/lib/services/notifications/digest-detail";

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// ── HTML escape (mirrors email-templates.ts) ────────────────────────────────
function escHtml(str: string | null | undefined): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Time formatting — stable, TZ-agnostic HH:MM (24h) from a Date ────────────
// We intentionally render in UTC-derived clock parts to keep the output
// deterministic (no server-locale drift); the digest window itself is already
// computed in the business timezone upstream.
function fmtTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ── Small style helpers for email-safe tables ────────────────────────────────
function th(label: string): string {
  return `<th align="left" style="padding:6px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;color:#475569;background:#eff6ff;font-family:${FONT_STACK};border-bottom:1px solid #e2e8f0;">${escHtml(label)}</th>`;
}
function td(inner: string): string {
  return `<td style="padding:6px 10px;font-size:13px;color:#0f172a;font-family:${FONT_STACK};border-bottom:1px solid #f1f5f9;vertical-align:top;">${inner}</td>`;
}

/** Wrap a rows-string in the standard bordered table shell with a header row. */
function dataTable(headers: string[], bodyRows: string): string {
  const head = `<tr>${headers.map(th).join("")}</tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;overflow:hidden;margin:0 0 6px;">${head}${bodyRows}</table>`;
}

/** An honest empty-state line for a section that has no records. */
function emptyLine(label: string): string {
  return `<p style="margin:2px 0 10px;font-size:13px;color:#94a3b8;font-family:${FONT_STACK};">${escHtml(label)}</p>`;
}

/** "+N more …" overflow note when a section was capped. */
function overflowNote(total: number, shown: number, noun: string): string {
  if (total <= shown) return "";
  return `<p style="margin:2px 0 10px;font-size:12px;color:#64748b;font-style:italic;font-family:${FONT_STACK};">+${total - shown} more ${escHtml(noun)} not shown (capped at ${MAX_ROWS_PER_SECTION}).</p>`;
}

/** Section sub-heading inside a user block (e.g. "📞 Calls (5)"). */
function subHeading(text: string): string {
  return `<p style="margin:14px 0 6px;font-size:14px;font-weight:700;color:#1e40af;font-family:${FONT_STACK};">${escHtml(text)}</p>`;
}

// ── Per-section renderers ─────────────────────────────────────────────────────
function renderCalls(calls: CallDetail[], total: number): string {
  const heading = subHeading(`📞 Calls (${total})`);
  if (total === 0) return heading + emptyLine("No Calls");
  const rows = calls
    .map(
      (c) =>
        `<tr>${td(escHtml(fmtTime(c.time)))}${td(escHtml(c.contact))}${td(escHtml(c.company))}${td(escHtml(c.durationLabel))}${td(escHtml(c.outcome))}${td(escHtml(c.notes))}</tr>`,
    )
    .join("");
  return (
    heading +
    dataTable(["Time", "Contact", "Company", "Duration", "Outcome", "Notes"], rows) +
    overflowNote(total, calls.length, "calls")
  );
}

function renderEmails(emails: EmailDetail[], total: number): string {
  const heading = subHeading(`📧 Emails (${total})`);
  if (total === 0) return heading + emptyLine("No Emails");
  const rows = emails
    .map(
      (e) =>
        `<tr>${td(escHtml(fmtTime(e.time)))}${td(escHtml(e.to))}${td(escHtml(e.subject))}${td(escHtml(e.delivery))}${td(escHtml(e.replyStatus))}</tr>`,
    )
    .join("");
  return (
    heading +
    dataTable(["Time", "To", "Subject", "Delivery", "Reply Status"], rows) +
    overflowNote(total, emails.length, "emails")
  );
}

function renderMeetings(meetings: MeetingDetail[], total: number): string {
  const heading = subHeading(`🤝 Meetings (${total})`);
  if (total === 0) return heading + emptyLine("No Meetings");
  const rows = meetings
    .map(
      (m) =>
        `<tr>${td(escHtml(fmtTime(m.time)))}${td(escHtml(m.client))}${td(escHtml(m.meetingType))}${td(escHtml(m.status))}${td(escHtml(m.notes))}</tr>`,
    )
    .join("");
  return (
    heading +
    dataTable(["Time", "Client", "Meeting Type", "Status", "Notes"], rows) +
    overflowNote(total, meetings.length, "meetings")
  );
}

function renderTasks(tasks: TaskDetail[], total: number): string {
  const heading = subHeading(`✅ Tasks Completed (${total})`);
  if (total === 0) return heading + emptyLine("No Tasks");
  const rows = tasks
    .map(
      (t) =>
        `<tr>${td(escHtml(fmtTime(t.time)))}${td(escHtml(t.task))}${td(escHtml(t.relatedRecord))}${td(escHtml(t.status))}</tr>`,
    )
    .join("");
  return (
    heading +
    dataTable(["Time", "Task", "Related Record", "Status"], rows) +
    overflowNote(total, tasks.length, "tasks")
  );
}

/** Compact per-user vertical key-value summary. */
function renderUserSummary(u: UserActivityDetail): string {
  const totalActivities = u.callsTotal + u.emailsTotal + u.meetingsTotal + u.tasksTotal;
  // Vertical key : value rows. Label column is fixed-width so the colons line
  // up; a monospace stack keeps the alignment stable across email clients.
  const row = (label: string, n: number, emphasize = false) =>
    `<tr>
      <td style="padding:3px 12px 3px 0;font-size:13px;color:${emphasize ? "#1e40af" : "#475569"};font-family:${FONT_STACK};white-space:nowrap;">${escHtml(label)}</td>
      <td style="padding:3px 0;font-size:13px;color:${emphasize ? "#1e40af" : "#475569"};font-family:${FONT_STACK};">:</td>
      <td style="padding:3px 0 3px 10px;font-size:13px;font-family:${FONT_STACK};"><strong style="color:${emphasize ? "#1e40af" : "#0f172a"};">${n}</strong></td>
    </tr>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-collapse:collapse;">
    ${row("Calls", u.callsTotal)}
    ${row("Emails", u.emailsTotal)}
    ${row("Meetings", u.meetingsTotal)}
    ${row("Tasks", u.tasksTotal)}
    ${row("Total Activities", totalActivities, true)}
  </table>`;
}

/** Blue user-name banner reused by both the summary and detail sections. */
function renderUserBanner(u: UserActivityDetail): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#1e40af;border-radius:8px;">
      <tr><td style="padding:10px 14px;font-size:16px;font-weight:700;color:#ffffff;font-family:${FONT_STACK};">
        👤 ${escHtml(u.userName)}
      </td></tr>
    </table>`;
}

/** Section band heading (e.g. "Team Member Summary" / "Detailed Activity Report"). */
function renderSectionHeading(text: string): string {
  return `<tr><td style="padding:20px 28px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
      <tr><td align="center" style="padding:12px 14px;font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#1e40af;font-family:${FONT_STACK};">
        ${escHtml(text)}
      </td></tr>
    </table>
  </td></tr>`;
}

/** Per-user summary-only block (banner + count summary + divider). */
function renderUserSummaryBlock(u: UserActivityDetail): string {
  return `<tr><td style="padding:8px 28px 4px;">
    ${renderUserBanner(u)}
    ${renderUserSummary(u)}
  </td></tr>
  <tr><td style="padding:0 28px;"><div style="border-top:1px solid #e2e8f0;margin:12px 0;"></div></td></tr>`;
}

/** One complete per-user detail block (banner + 4 sections + divider). */
function renderUserBlock(u: UserActivityDetail): string {
  return `<tr><td style="padding:8px 28px 4px;">
    ${renderUserBanner(u)}
    ${renderCalls(u.calls, u.callsTotal)}
    ${renderEmails(u.emails, u.emailsTotal)}
    ${renderMeetings(u.meetings, u.meetingsTotal)}
    ${renderTasks(u.tasks, u.tasksTotal)}
  </td></tr>
  <tr><td style="padding:0 28px;"><div style="border-top:2px solid #e2e8f0;margin:14px 0;"></div></td></tr>`;
}

// ── Org-wide summary strip (compact overview above the detail) ────────────────
function renderOrgSummary(d: AssembledDigest): string {
  const totals = d.userDetails.reduce(
    (acc, u) => {
      acc.calls += u.callsTotal;
      acc.emails += u.emailsTotal;
      acc.meetings += u.meetingsTotal;
      acc.tasks += u.tasksTotal;
      return acc;
    },
    { calls: 0, emails: 0, meetings: 0, tasks: 0 },
  );
  const total = totals.calls + totals.emails + totals.meetings + totals.tasks;
  const cell = (label: string, n: number) =>
    `<td align="center" style="padding:10px 8px;font-family:${FONT_STACK};border-right:1px solid #e2e8f0;">
      <div style="font-size:20px;font-weight:700;color:#1e40af;">${n}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:#64748b;">${escHtml(label)}</div>
    </td>`;
  return `<tr><td style="padding:16px 28px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;overflow:hidden;">
      <tr>
        ${cell("Reps", d.userDetails.length)}
        ${cell("Calls", totals.calls)}
        ${cell("Emails", totals.emails)}
        ${cell("Meetings", totals.meetings)}
        ${cell("Tasks", totals.tasks)}
        <td align="center" style="padding:10px 8px;font-family:${FONT_STACK};background:#eff6ff;">
          <div style="font-size:20px;font-weight:700;color:#1e40af;">${total}</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:#1e40af;">Total</div>
        </td>
      </tr>
    </table>
  </td></tr>`;
}

// ── Demo banner (prominent, top) ─────────────────────────────────────────────
function renderDemoBanner(d: AssembledDigest): string {
  if (!d.isDemo) return "";
  return `<tr><td style="padding:16px 28px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
      <tr><td style="padding:12px 14px;font-size:13px;font-weight:600;color:#92400e;font-family:${FONT_STACK};line-height:1.5;">
        ${escHtml(d.demoBanner)}
      </td></tr>
    </table>
  </td></tr>`;
}

// ── All per-user blocks (or an honest empty state) ────────────────────────────
// Layout: a "Team Member Summary" section (summaries only, every user) followed
// by a "Detailed Activity Report" section (full per-user tables, every user).
function renderUserSections(d: AssembledDigest): string {
  if (d.userDetails.length === 0) {
    return `<tr><td style="padding:20px 28px;font-size:14px;color:#94a3b8;font-family:${FONT_STACK};">
      No rep activity in scope for this period.
    </td></tr>`;
  }

  const summarySection =
    renderSectionHeading("Team Member Summary") +
    d.userDetails.map(renderUserSummaryBlock).join("");

  const detailSection =
    renderSectionHeading("Detailed Activity Report") +
    d.userDetails.map(renderUserBlock).join("");

  return summarySection + detailSection;
}

// ── Plain-text fallback (per-user counts) ─────────────────────────────────────
function renderTextBody(d: AssembledDigest): string {
  return d.userDetails
    .map((u) => {
      const total = u.callsTotal + u.emailsTotal + u.meetingsTotal + u.tasksTotal;
      return [
        `👤 ${u.userName}`,
        `  Calls: ${u.callsTotal} | Emails: ${u.emailsTotal} | Meetings: ${u.meetingsTotal} | Tasks: ${u.tasksTotal} | Total: ${total}`,
      ].join("\n");
    })
    .join("\n\n");
}

// ── Public renderer ──────────────────────────────────────────────────────────
export function renderDigestEmail(assembled: AssembledDigest): {
  subject: string;
  text: string;
  html: string;
} {
  const who = assembled.recipient.name || assembled.recipient.email;

  // Variant framing — weekly must be distinguishable from daily in subject + header.
  const isWeekly = assembled.variant === "weekly";
  const headerLabel = isWeekly ? "Weekly Summary" : "Activity Digest";
  const baseSubject = isWeekly ? "QuikCRM Weekly Summary — last 7 days" : "QuikCRM Activity Digest";
  const subject = assembled.isDemo ? `[DEMO] ${baseSubject}` : baseSubject;

  // Plain-text fallback.
  const text = [
    assembled.isDemo ? assembled.demoBanner : baseSubject,
    "",
    `Prepared for: ${who}`,
    "",
    assembled.userDetails.length ? renderTextBody(assembled) : "No rep activity in scope for this period.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:${FONT_STACK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;max-width:640px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1e40af;padding:18px 28px;">
          <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;font-family:${FONT_STACK};">QuikCRM</span>
          <span style="color:#93c5fd;font-size:13px;font-weight:400;margin-left:10px;font-family:${FONT_STACK};">${escHtml(headerLabel)}</span>
        </td></tr>

        <!-- Prepared-for -->
        <tr><td style="padding:16px 28px 0;font-size:13px;color:#475569;font-family:${FONT_STACK};">
          Prepared for <strong style="color:#0f172a;">${escHtml(who)}</strong>
        </td></tr>

        ${renderDemoBanner(assembled)}
        ${renderOrgSummary(assembled)}
        ${renderUserSections(assembled)}

        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9;">
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;font-family:${FONT_STACK};">
            You received this QuikCRM leadership digest based on your role. Scope reflects your dashboard view.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * Send a rendered digest to its recipient. CODED, but the BOUNDARY is: this is
 * NOT fired without explicit approval. (The email driver in this env defaults to
 * "console" — no real inbox is reachable — but we still do not call this on any
 * automated path until the cron schedule + send are approved.)
 */
export async function sendDigestEmail(assembled: AssembledDigest): Promise<void> {
  const { subject, text, html } = renderDigestEmail(assembled);
  await sendTransactionalEmail({ to: [assembled.recipient.email], subject, text, html });
}
