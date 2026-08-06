import nodemailer, { type Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env.EMAIL_USER;
  // Prefer EMAIL_PASSWORD_B64 — base64 bypasses Next.js dotenv-expand which
  // silently eats `$N` sequences in passwords (e.g. `$24` becomes "").
  const passB64 = process.env.EMAIL_PASSWORD_B64;
  const pass = passB64
    ? Buffer.from(passB64, "base64").toString("utf8")
    : process.env.EMAIL_PASSWORD;
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = (process.env.SMTP_SECURE ?? "false") === "true";
  const ciphers = process.env.SMTP_TLS_CIPHERS;

  if (!user || !pass) {
    console.warn("[email] EMAIL_USER / EMAIL_PASSWORD not configured — email send is disabled.");
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    requireTLS: !secure,
    tls: ciphers ? { ciphers } : undefined,
    // Pooled + bounded concurrency. Without this, nodemailer opens a NEW
    // connection per `sendMail`, so notifying N assignees in parallel opened N
    // simultaneous connections. Office365 caps concurrent connections per
    // mailbox (~3) and rejects the overflow, which meant some assignees never
    // received their email. The pool reuses connections and queues anything
    // above `maxConnections` instead of failing it — so a 10-assignee item
    // still delivers all 10, just sequenced.
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
  });

  console.log(
    `[email] transporter ready host=${host} port=${port} secure=${secure} user=${user} passLen=${pass.length}`,
  );
  return cachedTransporter;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<SendEmailResult> {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, error: "Email transporter not configured" };

  const from = process.env.SMTP_FROM || process.env.EMAIL_USER!;

  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    console.log(`[email] sent to=${Array.isArray(to) ? to.join(",") : to} messageId=${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error(`[email] sendMail failed to=${Array.isArray(to) ? to.join(",") : to}:`, err);
    return { ok: false, error: message };
  }
}

export interface KPIAssignmentEmailParams {
  ownerEmail: string;
  ownerName: string;
  kpiName: string;
  quarter: string;
  year: number;
  creatorName: string;
  kpiUrl?: string;
}

export function buildKPIAssignmentEmail({
  ownerName,
  kpiName,
  quarter,
  year,
  creatorName,
  kpiUrl,
}: Omit<KPIAssignmentEmailParams, "ownerEmail">) {
  const subject = "You have been assigned a KPI";

  const text = [
    `Hi ${ownerName},`,
    "",
    `You have been assigned a new KPI by ${creatorName}.`,
    "",
    `KPI: ${kpiName}`,
    `Period: ${quarter} ${year}`,
    "",
    kpiUrl ? `View it here: ${kpiUrl}` : "",
    "",
    "— QuikScale",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">You have been assigned a KPI</h2>
      <p style="margin:0 0 16px;line-height:1.5;">Hi <strong>${escapeHtml(ownerName)}</strong>,</p>
      <p style="margin:0 0 16px;line-height:1.5;">
        <strong>${escapeHtml(creatorName)}</strong> has assigned you a new KPI on QuikScale.
      </p>
      <table style="border-collapse:collapse;margin:0 0 16px;">
        <tbody>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">KPI</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(kpiName)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Quarter</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(quarter)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Year</td><td style="padding:6px 0;font-weight:600;">${year}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Assigned by</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(creatorName)}</td></tr>
        </tbody>
      </table>
      ${
        kpiUrl
          ? `<p style="margin:24px 0;"><a href="${escapeHtml(kpiUrl)}" style="background:#0066cc;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">View KPI</a></p>`
          : ""
      }
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">This is an automated notification from QuikScale.</p>
    </div>
  `;

  return { subject, html, text };
}

export interface PriorityAssignmentEmailParams {
  ownerName: string;
  priorityName: string;
  quarter: string;
  year: number;
  creatorName: string;
  priorityUrl?: string;
}

export function buildPriorityAssignmentEmail({
  ownerName,
  priorityName,
  quarter,
  year,
  creatorName,
  priorityUrl,
}: PriorityAssignmentEmailParams) {
  const subject = "A Priority has been assigned to you";

  const text = [
    `Hi ${ownerName},`,
    "",
    `${creatorName} has assigned you a new Priority on QuikScale.`,
    "",
    `Priority: ${priorityName}`,
    `Period: ${quarter} ${year}`,
    "",
    priorityUrl ? `View it here: ${priorityUrl}` : "",
    "",
    "— QuikScale",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">A Priority has been assigned to you</h2>
      <p style="margin:0 0 16px;line-height:1.5;">Hi <strong>${escapeHtml(ownerName)}</strong>,</p>
      <p style="margin:0 0 16px;line-height:1.5;">
        <strong>${escapeHtml(creatorName)}</strong> has assigned you a new Priority on QuikScale.
      </p>
      <table style="border-collapse:collapse;margin:0 0 16px;">
        <tbody>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Priority</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(priorityName)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Quarter</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(quarter)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Year</td><td style="padding:6px 0;font-weight:600;">${year}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Assigned by</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(creatorName)}</td></tr>
        </tbody>
      </table>
      ${
        priorityUrl
          ? `<p style="margin:24px 0;"><a href="${escapeHtml(priorityUrl)}" style="background:#0066cc;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">View Priority</a></p>`
          : ""
      }
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">This is an automated notification from QuikScale.</p>
    </div>
  `;

  return { subject, html, text };
}

export interface WWWAssignmentEmailParams {
  ownerName: string;
  what: string;
  whenDate: string; // formatted date string e.g. "May 12, 2026"
  creatorName: string;
  itemUrl?: string;
}

export function buildWWWAssignmentEmail({
  ownerName,
  what,
  whenDate,
  creatorName,
  itemUrl,
}: WWWAssignmentEmailParams) {
  const subject = "A new action item has been assigned to you";

  const text = [
    `Hi ${ownerName},`,
    "",
    `${creatorName} has assigned you a new action item on QuikScale.`,
    "",
    `What: ${what}`,
    `When (deadline): ${whenDate}`,
    "",
    itemUrl ? `View it here: ${itemUrl}` : "",
    "",
    "— QuikScale",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">A new action item has been assigned to you</h2>
      <p style="margin:0 0 16px;line-height:1.5;">Hi <strong>${escapeHtml(ownerName)}</strong>,</p>
      <p style="margin:0 0 16px;line-height:1.5;">
        <strong>${escapeHtml(creatorName)}</strong> has assigned you a new action item on QuikScale.
      </p>
      <table style="border-collapse:collapse;margin:0 0 16px;">
        <tbody>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;">What</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(what)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">When (deadline)</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(whenDate)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Assigned by</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(creatorName)}</td></tr>
        </tbody>
      </table>
      ${
        itemUrl
          ? `<p style="margin:24px 0;"><a href="${escapeHtml(itemUrl)}" style="background:#0066cc;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">View Action Item</a></p>`
          : ""
      }
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">This is an automated notification from QuikScale.</p>
    </div>
  `;

  return { subject, html, text };
}

export interface WWWUpdateEmailParams {
  recipientName: string;
  what: string;
  updaterName: string;
  oldAssigneeNames: string[];
  newAssigneeNames: string[];
  itemUrl?: string;
}

export function buildWWWUpdateEmail({
  recipientName,
  what,
  updaterName,
  oldAssigneeNames,
  newAssigneeNames,
  itemUrl,
}: WWWUpdateEmailParams) {
  const subject = "Your action item has been updated";

  const oldStr = oldAssigneeNames.length > 0 ? oldAssigneeNames.join(", ") : "—";
  const newStr = newAssigneeNames.length > 0 ? newAssigneeNames.join(", ") : "—";

  const text = [
    `Hi ${recipientName},`,
    "",
    `${updaterName} updated the assignees on an action item.`,
    "",
    `What: ${what}`,
    `Updated by: ${updaterName}`,
    `Previous assignees: ${oldStr}`,
    `New assignees: ${newStr}`,
    "",
    itemUrl ? `View it here: ${itemUrl}` : "",
    "",
    "— QuikScale",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Your action item has been updated</h2>
      <p style="margin:0 0 16px;line-height:1.5;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>
      <p style="margin:0 0 16px;line-height:1.5;">
        <strong>${escapeHtml(updaterName)}</strong> updated the assignees on an action item on QuikScale.
      </p>
      <table style="border-collapse:collapse;margin:0 0 16px;">
        <tbody>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;">What</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(what)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Updated by</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(updaterName)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;">Previous assignees</td><td style="padding:6px 0;color:#64748b;text-decoration:line-through;">${escapeHtml(oldStr)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;">New assignees</td><td style="padding:6px 0;font-weight:600;color:#0f172a;">${escapeHtml(newStr)}</td></tr>
        </tbody>
      </table>
      ${
        itemUrl
          ? `<p style="margin:24px 0;"><a href="${escapeHtml(itemUrl)}" style="background:#0066cc;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">View Action Item</a></p>`
          : ""
      }
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">This is an automated notification from QuikScale.</p>
    </div>
  `;

  return { subject, html, text };
}

export interface ReplacementEmailParams {
  ownerName: string;
  /** The KPI/Priority name before the replacement. */
  oldName: string;
  /** The KPI/Priority name after the replacement. */
  newName: string;
  quarter: string;
  year: number;
  /** Who performed the replacement (the OPSP export actor). */
  replacedByName: string;
  /** Whether the previous weekly data was retained (true) or reset (false). */
  dataRetained: boolean;
  url?: string;
}

/** Shared body for KPI/Priority replacement emails. `kind` = "KPI" | "Priority". */
function buildReplacementEmail(kind: "KPI" | "Priority", p: ReplacementEmailParams) {
  const subject = `Your ${kind} was replaced`;
  const dataLine = p.dataRetained
    ? "Your previous weekly progress and notes were carried forward."
    : "This is a fresh start — previous weekly progress and notes were cleared.";
  const viewLabel = `View ${kind}`;

  const text = [
    `Hi ${p.ownerName},`,
    "",
    `${p.replacedByName} replaced a ${kind} assigned to you on QuikScale.`,
    "",
    `Previous: ${p.oldName}`,
    `Now: ${p.newName}`,
    `Period: ${p.quarter} ${p.year}`,
    "",
    dataLine,
    "",
    p.url ? `View it here: ${p.url}` : "",
    "",
    "— QuikScale",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Your ${kind} was replaced</h2>
      <p style="margin:0 0 16px;line-height:1.5;">Hi <strong>${escapeHtml(p.ownerName)}</strong>,</p>
      <p style="margin:0 0 16px;line-height:1.5;">
        <strong>${escapeHtml(p.replacedByName)}</strong> replaced a ${kind} assigned to you on QuikScale.
      </p>
      <table style="border-collapse:collapse;margin:0 0 16px;">
        <tbody>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Previous</td><td style="padding:6px 0;color:#64748b;text-decoration:line-through;">${escapeHtml(p.oldName)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Now</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(p.newName)}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Period</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(p.quarter)} ${p.year}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Replaced by</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(p.replacedByName)}</td></tr>
        </tbody>
      </table>
      <p style="margin:0 0 16px;line-height:1.5;color:${p.dataRetained ? "#15803d" : "#b45309"};">${escapeHtml(dataLine)}</p>
      ${
        p.url
          ? `<p style="margin:24px 0;"><a href="${escapeHtml(p.url)}" style="background:#0066cc;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">${viewLabel}</a></p>`
          : ""
      }
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">This is an automated notification from QuikScale.</p>
    </div>
  `;

  return { subject, html, text };
}

export function buildKPIReplacementEmail(params: ReplacementEmailParams) {
  return buildReplacementEmail("KPI", params);
}

export function buildPriorityReplacementEmail(params: ReplacementEmailParams) {
  return buildReplacementEmail("Priority", params);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Rockefeller Habits assessment ────────────────────────────────────────────

export type HabitCampaignEvent = "created" | "launched" | "deadline_changed" | "closed";

export interface HabitCampaignEmailParams {
  recipientName: string;
  /** e.g. "Q2 2026". */
  periodLabel: string;
  actorName: string;
  /** Formatted deadline, or null when none is set. */
  deadlineLabel: string | null;
  campaignUrl?: string;
}

/**
 * One builder for all four campaign lifecycle events — the body differs only in
 * its headline and lead sentence, so a single template keeps them consistent.
 *
 * `created` deliberately says the assessment is being PREPARED rather than
 * asking anyone to fill it in: members cannot submit to a draft (the API
 * rejects it until launch), so promising otherwise would send them to a dead end.
 */
export function buildHabitCampaignEmail(
  event: HabitCampaignEvent,
  { recipientName, periodLabel, actorName, deadlineLabel, campaignUrl }: HabitCampaignEmailParams,
) {
  const copy: Record<HabitCampaignEvent, { subject: string; lead: string; cta: string | null }> = {
    created: {
      subject: `A Rockefeller Habits assessment is being prepared for ${periodLabel}`,
      lead: `${actorName} created the ${periodLabel} Rockefeller Habits assessment. You'll be notified again once it opens for responses.`,
      cta: null,
    },
    launched: {
      subject: `The ${periodLabel} Rockefeller Habits assessment is open`,
      lead: `${actorName} opened the ${periodLabel} Rockefeller Habits assessment. Your responses are anonymous — only the aggregate is shown.`,
      cta: "Fill it in",
    },
    deadline_changed: {
      subject: `Deadline updated — ${periodLabel} Rockefeller Habits assessment`,
      lead: `${actorName} changed the deadline for the ${periodLabel} Rockefeller Habits assessment.`,
      cta: "Fill it in",
    },
    closed: {
      subject: `The ${periodLabel} Rockefeller Habits assessment is closed`,
      lead: `${actorName} closed the ${periodLabel} Rockefeller Habits assessment. No further responses are accepted.`,
      cta: "View results",
    },
  };
  const { subject, lead, cta } = copy[event];
  const deadlineLine = deadlineLabel ? `Deadline: ${deadlineLabel}` : "Deadline: not set";

  const text = [
    `Hi ${recipientName},`,
    "",
    lead,
    "",
    event === "closed" ? "" : deadlineLine,
    "",
    campaignUrl ? `Open it here: ${campaignUrl}` : "",
    "",
    "— QuikScale",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">${escapeHtml(subject)}</h2>
      <p style="margin:0 0 16px;line-height:1.5;">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>
      <p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(lead)}</p>
      <table style="border-collapse:collapse;margin:0 0 16px;">
        <tbody>
          <tr><td style="padding:6px 12px 6px 0;color:#64748b;">Assessment</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(periodLabel)} Rockefeller Habits</td></tr>
          ${
            event === "closed"
              ? ""
              : `<tr><td style="padding:6px 12px 6px 0;color:#64748b;">Deadline</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(deadlineLabel ?? "Not set")}</td></tr>`
          }
        </tbody>
      </table>
      ${
        campaignUrl && cta
          ? `<p style="margin:24px 0;"><a href="${escapeHtml(campaignUrl)}" style="background:#0066cc;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">${escapeHtml(cta)}</a></p>`
          : ""
      }
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">This is an automated notification from QuikScale.</p>
    </div>
  `;

  return { subject, html, text };
}
