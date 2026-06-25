/**
 * Daily-digest email RENDERER (Phase 5 template unit).
 *
 * renderDigestEmail(assembled) → email-client-safe { subject, text, html }.
 * Matches the existing transactional-email convention (lib/notifications/
 * email-templates.ts): <!DOCTYPE>, table-based layout, INLINE styles only
 * (no <style> block, no flex/grid), #1e40af brand header, escHtml() on every
 * dynamic value, safe fallback font stack.
 *
 * Sections (content shape locked from the prototype):
 *   - DEMO banner (prominent, top — from assembled.demoBanner; the data is
 *     ALL-TIME, not yesterday, while window unit (i) is deferred).
 *   - §1 Activity volume by rep
 *   - §2 Activity mix by type
 *   - §3 Per-rep custom-field aggregates (top-N types): Number → per-rep sum +
 *        team total; Select/Text → value×count.
 *   - §4 Tasks DUE/OVERDUE — LAYOUT + a LOUD "NOT BUILT" placeholder. The tasks
 *        DATA is a separate unit; this section must look UNMISTAKABLY unwired,
 *        never mistakable for "zero tasks today".
 *
 * sendDigestEmail(assembled) is CODED but the boundary is: it is NEVER fired
 * without explicit approval. (This env's email driver defaults to "console"
 * anyway — no real inbox is reachable here.)
 *
 * HONEST LABEL: a correct HTML string ≠ verified across real inbox clients
 * (Outlook/Gmail/Apple Mail) — that is OWED, deploy-only.
 */

import { sendTransactionalEmail } from "@/lib/services/email/send";
import type { AssembledDigest } from "@/lib/services/notifications/digest-run";
import type { ActivityFieldAggregate } from "@/lib/services/dashboard/activity-field-aggregates";

// Named tunable render limits.
const MAX_VALUE_CHIPS_PER_REP = 6; // Select/Text: cap value×count chips per rep cell

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

// ── Section heading ─────────────────────────────────────────────────────────
function sectionHeading(label: string): string {
  return `<tr><td style="padding:22px 28px 6px;">
    <h3 style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.4px;
               text-transform:uppercase;color:#1e40af;font-family:${FONT_STACK};">
      ${escHtml(label)}
    </h3></td></tr>`;
}

// ── §1 Activity volume by rep ───────────────────────────────────────────────
// FLIPPED (2026-06-24): now consumes assembled.activityByRep — TRUE per-rep
// activity volume (count of CrmActivity rows per owner, tier-scoped), sourced
// from buildRoleMetrics' new activityByRep DTO field (single-sourced scope). The
// earlier honest-label workaround (field-aggregate CONTRIBUTIONS + amber flag) is
// removed because the number is now correct. ownerName is the denormalized
// CrmActivity.ownerName (same name source as §3 — one name behavior per email).
// NOTE: numbers are ALL-TIME (the window param is built+verified but not yet
// applied here — DEMO banner covers that). §1 now shows the right METRIC; the
// banner covers the time-scope.
function renderByRep(d: AssembledDigest): string {
  const ranked = [...d.activityByRep].sort((a, b) => b.count - a.count);

  const rows = ranked.length
    ? ranked
        .map(
          (r) => `<tr>
            <td style="padding:7px 28px;font-size:14px;color:#0f172a;font-family:${FONT_STACK};border-top:1px solid #f1f5f9;">${escHtml(r.ownerName ?? r.ownerId)}</td>
            <td align="right" style="padding:7px 28px;font-size:14px;font-weight:600;color:#0f172a;font-family:${FONT_STACK};border-top:1px solid #f1f5f9;">${Number(r.count)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td style="padding:7px 28px;font-size:13px;color:#94a3b8;font-family:${FONT_STACK};">No rep activity in scope.</td></tr>`;

  return (
    sectionHeading("Activity volume by rep") +
    `<tr><td style="padding:0 0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`
  );
}

// ── §2 Activity mix by type ─────────────────────────────────────────────────
function renderByType(d: AssembledDigest): string {
  const rows = d.activitiesByType.length
    ? d.activitiesByType
        .map(
          (t) => `<tr>
            <td style="padding:7px 28px;font-size:14px;color:#0f172a;font-family:${FONT_STACK};border-top:1px solid #f1f5f9;">${escHtml(t.type)}</td>
            <td align="right" style="padding:7px 28px;font-size:14px;font-weight:600;color:#0f172a;font-family:${FONT_STACK};border-top:1px solid #f1f5f9;">${Number(t.count)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td style="padding:7px 28px;font-size:13px;color:#94a3b8;font-family:${FONT_STACK};">No activities in scope.</td></tr>`;

  return (
    sectionHeading("Activity mix by type") +
    `<tr><td style="padding:0 0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`
  );
}

// ── §3 Per-rep custom-field aggregates ──────────────────────────────────────
function renderFieldCell(agg: ActivityFieldAggregate, ownerId: string): string {
  const rep = agg.perRep.find((r) => r.ownerId === ownerId);
  if (!rep) return "—";
  if (agg.fieldType === "Number") {
    return String(rep.numberSum ?? 0);
  }
  const chips = (rep.countsByValue ?? []).slice(0, MAX_VALUE_CHIPS_PER_REP);
  if (chips.length === 0) return "—";
  return chips.map((c) => `${escHtml(c.value)}&times;${Number(c.count)}`).join(", ");
}

function renderTypeTable(typeId: string, aggs: ActivityFieldAggregate[]): string {
  if (aggs.length === 0) return "";

  const owners = new Map<string, string>();
  for (const a of aggs) for (const r of a.perRep) if (!owners.has(r.ownerId)) owners.set(r.ownerId, r.ownerName ?? r.ownerId);
  const ownerList = Array.from(owners.entries());
  const hasTotals = aggs.some((a) => a.teamTotal?.numberSum != null);

  const th = (label: string) =>
    `<th align="left" style="padding:6px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;color:#475569;background:#eff6ff;font-family:${FONT_STACK};border-bottom:1px solid #e2e8f0;">${escHtml(label)}</th>`;
  const td = (inner: string) =>
    `<td style="padding:6px 10px;font-size:13px;color:#0f172a;font-family:${FONT_STACK};border-bottom:1px solid #f1f5f9;">${inner}</td>`;

  const head = `<tr>${th("Rep")}${aggs.map((a) => th(a.fieldLabel)).join("")}</tr>`;
  const body = ownerList
    .map(([oid, name]) => `<tr>${td(escHtml(name))}${aggs.map((a) => td(renderFieldCell(a, oid))).join("")}</tr>`)
    .join("");
  const foot = hasTotals
    ? `<tr>${td("<strong>Team total</strong>")}${aggs
        .map((a) => td(a.teamTotal?.numberSum != null ? `<strong>${Number(a.teamTotal.numberSum)}</strong>` : ""))
        .join("")}</tr>`
    : "";

  return `<tr><td style="padding:4px 28px 14px;">
    <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#475569;font-family:${FONT_STACK};">${escHtml(typeId)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;overflow:hidden;">
      ${head}${body}${foot}
    </table>
  </td></tr>`;
}

function renderFieldAggregates(d: AssembledDigest): string {
  const tables = d.fieldAggregates.map((fa) => renderTypeTable(fa.activityTypeId, fa.aggregates)).join("");
  return (
    sectionHeading("Per-rep field aggregates (top types)") +
    (tables ||
      `<tr><td style="padding:4px 28px 14px;font-size:13px;color:#94a3b8;font-family:${FONT_STACK};">No custom-field activity in scope.</td></tr>`)
  );
}

// ── §4 Tasks completed in the window — per-rep + total (matches §2 style) ─────
function renderCompletedTasks(d: AssembledDigest): string {
  const rows = d.completedTasksByRep.length
    ? d.completedTasksByRep
        .map(
          (r) => `<tr>
            <td style="padding:7px 28px;font-size:14px;color:#0f172a;font-family:${FONT_STACK};border-top:1px solid #f1f5f9;">${escHtml(r.ownerName ?? r.userId)}</td>
            <td align="right" style="padding:7px 28px;font-size:14px;font-weight:600;color:#0f172a;font-family:${FONT_STACK};border-top:1px solid #f1f5f9;">${Number(r.count)}</td>
          </tr>`,
        )
        .join("") +
      `<tr>
        <td style="padding:7px 28px;font-size:13px;font-weight:600;color:#475569;font-family:${FONT_STACK};border-top:1px solid #e2e8f0;">Total</td>
        <td align="right" style="padding:7px 28px;font-size:14px;font-weight:700;color:#0f172a;font-family:${FONT_STACK};border-top:1px solid #e2e8f0;">${Number(d.completedTasksTotal)}</td>
      </tr>`
    : `<tr><td style="padding:7px 28px;font-size:13px;color:#94a3b8;font-family:${FONT_STACK};">No tasks completed in the last 24h.</td></tr>`;

  return (
    sectionHeading("Tasks completed") +
    `<tr><td style="padding:0 0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`
  );
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
  const windowLabel = isWeekly ? "last 7 days" : "last 24h";
  const subject = assembled.isDemo ? `[DEMO] ${baseSubject}` : baseSubject;

  // Plain-text fallback.
  const text = [
    assembled.isDemo ? assembled.demoBanner : baseSubject,
    "",
    `Prepared for: ${who}`,
    "",
    "Activity volume by rep / Activity mix by type / Per-rep field aggregates — see HTML.",
    "",
    `Tasks completed (${windowLabel}): ${assembled.completedTasksTotal}.`,
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
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;max-width:600px;width:100%;">

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
        ${renderByRep(assembled)}
        ${renderByType(assembled)}
        ${renderFieldAggregates(assembled)}
        ${renderCompletedTasks(assembled)}

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
 * NOT fired without explicit approval. No test invokes it. (The email driver in
 * this env defaults to "console" — no real inbox is reachable — but we still do
 * not call this on any automated path until the cron schedule + send are approved.)
 */
export async function sendDigestEmail(assembled: AssembledDigest): Promise<void> {
  const { subject, text, html } = renderDigestEmail(assembled);
  await sendTransactionalEmail({ to: [assembled.recipient.email], subject, text, html });
}
