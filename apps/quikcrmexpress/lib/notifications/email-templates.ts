/**
 * Notification email templates + delivery.
 *
 * Uses the existing sendTransactionalEmail() abstraction so the driver
 * (console / resend / brevo / office365) is controlled by the EMAIL_PROVIDER
 * env var. All failures are silently swallowed — email is best-effort and must
 * never surface as an error on the triggering API response.
 */

import { sendTransactionalEmail } from "@/lib/services/email/send";
import { prisma } from "@/lib/db/prisma";
import type { NotificationPayload } from "./types";

// ─── User lookup ──────────────────────────────────────────────────────────────

/** Resolve a recipient's email + display name from auth.User. */
async function getUserContact(
  userId: string,
): Promise<{ email: string | null; name: string | null }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user) return { email: null, name: null };
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;
    return { email: user.email ?? null, name };
  } catch {
    return { email: null, name: null };
  }
}

// ─── Task deep-links ──────────────────────────────────────────────────────────

/** Task notification types that warrant a "snooze the reminder" affordance. */
const SNOOZABLE_TASK_TYPES = new Set([
  "task_assigned",
  "task_due_today",
  "task_due_tomorrow",
  "task_overdue",
]);

/**
 * Detect a task notification and pull its taskId so the email can deep-link
 * into /tasks. `snoozable` is false for terminal events (e.g. task_completed)
 * where a snooze button would make no sense.
 *
 * The snooze links are login-gated: they open `/tasks?focus=<id>&snooze=<min>`,
 * and the authenticated TasksExplorer performs the snooze via the existing
 * POST /api/tasks/:id/snooze endpoint. No session-less route is involved.
 */
function taskContext(
  payload: NotificationPayload,
): { taskId: string; snoozable: boolean } | null {
  const meta = payload.metadata;
  if (!meta) return null;
  const type = typeof meta.type === "string" ? meta.type : "";
  const taskId = typeof meta.taskId === "string" ? meta.taskId : "";
  if (!taskId || !type.startsWith("task_")) return null;
  return { taskId, snoozable: SNOOZABLE_TASK_TYPES.has(type) };
}

// ─── Render helpers (inline styles only — email clients strip <style>) ──────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0]![0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Category pill — label + colors. Tasks read "Task", not the DB "lead" bucket. */
function chipFor(
  payload: NotificationPayload,
  isTask: boolean,
): { label: string; bg: string; fg: string } {
  if (isTask) return { label: "Task", bg: "#eef2ff", fg: "#4338ca" };
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    lead: { label: "Lead", bg: "#eff6ff", fg: "#1d4ed8" },
    automation: { label: "Automation", bg: "#f5f3ff", fg: "#6d28d9" },
    system: { label: "System", bg: "#f1f5f9", fg: "#475569" },
  };
  const cat = payload.category ?? "notification";
  return map[cat] ?? { label: cat, bg: "#eff6ff", fg: "#1d4ed8" };
}

/** Color-coded priority pill with a leading dot (empty string when unknown). */
function priorityPill(priority: string | null): string {
  if (!priority) return "";
  const p = priority.toLowerCase();
  const c =
    p === "high"
      ? { bg: "#fee2e2", fg: "#b91c1c" }
      : p === "low"
      ? { bg: "#dcfce7", fg: "#15803d" }
      : { bg: "#fef3c7", fg: "#b45309" };
  return `<span style="display:inline-block;padding:4px 11px;border-radius:9999px;
                 background:${c.bg};color:${c.fg};font-size:11px;font-weight:700;
                 letter-spacing:0.4px;text-transform:uppercase;white-space:nowrap;
                 font-family:inherit;">● ${escHtml(priority)}</span>`;
}

/** Circular initials avatar. */
function avatarHtml(text: string, bg: string): string {
  return `<span style="display:inline-block;width:48px;height:48px;line-height:48px;
                 border-radius:9999px;background:${bg};color:#ffffff;font-size:15px;
                 font-weight:700;text-align:center;font-family:inherit;">${escHtml(text)}</span>`;
}

/** From → To avatar row used on assignment emails. */
function renderFromTo(fromName: string, toName: string): string {
  const label = (t: string) =>
    `<div style="margin-top:10px;font-size:10px;letter-spacing:1.2px;color:#94a3b8;
           text-transform:uppercase;font-family:inherit;">${t}</div>`;
  const name = (t: string, suffix = "") =>
    `<div style="margin-top:3px;font-size:13px;font-weight:700;color:#0f172a;
           font-family:inherit;">${escHtml(t)}${suffix}</div>`;
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
      <td align="center" style="padding:0 16px;vertical-align:top;">
        ${avatarHtml(initials(fromName), "#1e293b")}${label("From")}${name(fromName)}
      </td>
      <td align="center" style="padding:0 2px 28px;vertical-align:middle;">
        <span style="display:inline-block;width:30px;height:30px;line-height:30px;
                     border-radius:9999px;background:#eef2ff;color:#4338ca;text-align:center;
                     font-size:14px;font-family:inherit;">→</span>
      </td>
      <td align="center" style="padding:0 16px;vertical-align:top;">
        ${avatarHtml(initials(toName), "#2563eb")}${label("To")}${name(
          toName,
          ' <span style="color:#94a3b8;font-weight:500;">(You)</span>',
        )}
      </td>
    </tr>
  </table>`;
}

/** A label/value row inside the detail card (skipped when value is empty). */
function metaRow(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<tr>
    <td style="padding:12px 0 0;font-size:11px;font-weight:600;letter-spacing:0.5px;
               color:#94a3b8;text-transform:uppercase;font-family:inherit;">${escHtml(label)}</td>
    <td style="padding:12px 0 0;text-align:right;font-size:13px;font-weight:700;
               color:#0f172a;font-family:inherit;">${escHtml(value)}</td>
  </tr>`;
}

/** The bordered task detail card (TASK label + priority, subject, fact rows). */
function renderTaskCard(opts: {
  label: string;
  subject: string;
  priority: string | null;
  dueStr: string;
  assignedBy: string | null;
}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="margin-top:24px;border:1px solid #e2e8f0;border-radius:12px;">
    <tr><td style="padding:20px 22px;font-family:inherit;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="left"><span style="font-size:11px;font-weight:700;letter-spacing:0.8px;
                                  color:#4338ca;text-transform:uppercase;font-family:inherit;">${escHtml(
                                    opts.label,
                                  )}</span></td>
          <td align="right">${priorityPill(opts.priority)}</td>
        </tr>
      </table>
      <div style="margin-top:10px;font-size:17px;font-weight:700;color:#0f172a;
                  line-height:1.35;font-family:inherit;">${escHtml(opts.subject)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="margin-top:16px;border-top:1px solid #eef2f7;">
        ${metaRow("Due date", opts.dueStr)}
        ${metaRow("Priority", opts.priority)}
        ${metaRow("Assigned by", opts.assignedBy)}
      </table>
    </td></tr>
  </table>`;
}

/** Full-width Open-task button + (optional) snooze buttons. */
function renderTaskActions(
  openUrl: string,
  snooze1hUrl: string | null,
  snooze1dUrl: string | null,
): string {
  const open = `<a href="${escHtml(openUrl)}"
        style="display:block;margin-top:24px;padding:15px 24px;background:#2563eb;
               color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;
               font-weight:700;text-align:center;box-shadow:0 2px 4px rgba(37,99,235,0.3);
               font-family:inherit;">Open task →</a>`;
  if (!snooze1hUrl || !snooze1dUrl) return open;
  const sBtn = (href: string, lbl: string) =>
    `<a href="${escHtml(href)}" style="display:block;padding:11px;background:#ffffff;
        border:1px solid #d7dce5;color:#334155;text-decoration:none;border-radius:10px;
        font-size:13px;font-weight:600;text-align:center;font-family:inherit;">${lbl}</a>`;
  return `${open}
    <p style="margin:18px 0 10px;text-align:center;font-size:12px;color:#94a3b8;font-family:inherit;">
      Not ready yet? Snooze the reminder (opens QuikCRM):
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="50%" style="padding-right:5px;">${sBtn(snooze1hUrl, "Snooze 1 hour")}</td>
      <td width="50%" style="padding-left:5px;">${sBtn(snooze1dUrl, "Snooze 1 day")}</td>
    </tr></table>`;
}

// ─── Template builder ─────────────────────────────────────────────────────────

export function buildEmailContent(
  payload: NotificationPayload,
  opts: { recipientName?: string } = {},
): {
  subject: string;
  text: string;
  html: string;
} {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://app.quikcrm.com";
  const actionUrl = payload.link ? `${baseUrl}${payload.link}` : baseUrl;

  // Task notifications get richer CTAs (Open + Snooze) that deep-link by id.
  const task = taskContext(payload);
  const taskOpenUrl = task
    ? `${baseUrl}/tasks?focus=${encodeURIComponent(task.taskId)}`
    : null;
  const snooze1hUrl = task?.snoozable ? `${taskOpenUrl}&snooze=60` : null;
  const snooze1dUrl = task?.snoozable ? `${taskOpenUrl}&snooze=1440` : null;

  const subject = payload.title;

  const ctaLines = task
    ? [
        `Open task: ${taskOpenUrl}`,
        ...(snooze1hUrl ? [`Snooze 1 hour: ${snooze1hUrl}`] : []),
        ...(snooze1dUrl ? [`Snooze 1 day: ${snooze1dUrl}`] : []),
      ]
    : [`View in QuikCRM: ${actionUrl}`];

  const text = [
    payload.title,
    "",
    payload.body,
    "",
    ...ctaLines,
    "",
    "──────────────────────────────────",
    "You're receiving this because you're assigned to this record in QuikCRM.",
    "Manage notifications in Settings → Profile.",
  ].join("\n");

  // ── Body (HTML) ──────────────────────────────────────────────────────────────
  const isTask = Boolean(task);
  const meta = payload.metadata ?? {};
  const taskSubject = typeof meta.taskSubject === "string" ? meta.taskSubject : null;
  const taskPriority = typeof meta.priority === "string" ? meta.priority : null;
  const dueIso = typeof meta.dueDate === "string" ? meta.dueDate : null;
  const assignedByName = typeof meta.assignedByName === "string" ? meta.assignedByName : null;
  const isReassignment = meta.isReassignment === true;
  const recipientName = opts.recipientName ?? null;
  const chip = chipFor(payload, isTask);

  let inner: string;
  if (isTask && task && taskOpenUrl) {
    const showFromTo = meta.type === "task_assigned" && !!assignedByName && !!recipientName;
    let head: string;
    if (showFromTo) {
      const verb = isReassignment ? "reassigned a task to" : "assigned a task to";
      head =
        renderFromTo(assignedByName!, recipientName!) +
        `<p style="margin:18px 0 0;text-align:center;font-size:15px;color:#334155;
              line-height:1.5;font-family:inherit;"><strong style="color:#0f172a;">${escHtml(
                assignedByName!,
              )}</strong> ${verb} <strong style="color:#0f172a;">${escHtml(
          recipientName!,
        )}</strong>.</p>`;
    } else {
      head = `<h1 style="margin:0;text-align:center;font-size:20px;font-weight:700;
                    color:#0f172a;line-height:1.3;font-family:inherit;">${escHtml(payload.title)}</h1>`;
    }
    const card = renderTaskCard({
      label: chip.label,
      subject: taskSubject ?? payload.title,
      priority: taskPriority,
      dueStr: fmtDate(dueIso),
      assignedBy: assignedByName,
    });
    inner = head + card + renderTaskActions(taskOpenUrl, snooze1hUrl, snooze1dUrl);
  } else {
    const chipHtml = `<span style="display:inline-block;padding:4px 12px;border-radius:9999px;
                       background:${chip.bg};color:${chip.fg};font-size:11px;font-weight:700;
                       letter-spacing:0.5px;text-transform:uppercase;font-family:inherit;">${escHtml(
                         chip.label,
                       )}</span>`;
    const view = payload.link
      ? `<a href="${escHtml(actionUrl)}" style="display:block;margin-top:22px;padding:14px 24px;
            background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;
            font-weight:700;text-align:center;box-shadow:0 2px 4px rgba(37,99,235,0.3);
            font-family:inherit;">View in QuikCRM →</a>`
      : "";
    inner = `${chipHtml}
      <h1 style="margin:14px 0 8px;font-size:20px;font-weight:700;color:#0f172a;
                 line-height:1.3;font-family:inherit;">${escHtml(payload.title)}</h1>
      <p style="margin:0;font-size:14px;color:#475569;line-height:1.65;font-family:inherit;">${escHtml(
        payload.body,
      )}</p>
      ${view}`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <title>${escHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#eef1f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;
                      overflow:hidden;max-width:600px;width:100%;
                      box-shadow:0 8px 24px rgba(15,23,42,0.06);">

          <!-- Header -->
          <tr>
            <td bgcolor="#0f172a" style="background-color:#0f172a;padding:22px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left">
                    <span style="font-size:19px;font-weight:800;color:#ffffff;
                                 letter-spacing:-0.2px;font-family:inherit;">Quik<span
                                 style="color:#818cf8;">CRM</span></span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;font-weight:600;letter-spacing:2px;
                                 color:#64748b;text-transform:uppercase;font-family:inherit;">Notification</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px 32px;">
              ${inner}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #eef2f7;text-align:center;">
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;font-family:inherit;">
                You're receiving this because you're assigned to this record in QuikCRM.
                <a href="${escHtml(baseUrl)}/settings/profile"
                   style="color:#64748b;text-decoration:underline;">Manage notifications</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

// ─── HTML escape helper ───────────────────────────────────────────────────────

function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Look up the recipient's email + name and send a notification email.
 * Throws on hard failure (caller should catch and swallow).
 */
export async function sendNotificationEmail(
  payload: NotificationPayload,
): Promise<void> {
  const { email, name } = await getUserContact(payload.userId);
  if (!email) return; // user not found or no email — skip silently

  const { subject, text, html } = buildEmailContent(payload, {
    recipientName: name ?? undefined,
  });
  await sendTransactionalEmail({ to: [email], subject, text, html });
}
