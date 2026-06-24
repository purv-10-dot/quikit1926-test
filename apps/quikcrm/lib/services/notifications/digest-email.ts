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

// ── §1 Reps active — by custom-field contribution ───────────────────────────
// HONEST LABEL (decision 2026-06-24): this is NOT yet true per-rep activity
// volume. buildRoleMetrics exposes only scalar totals (no per-rep breakdown), so
// the correct per-rep activity count (a: add activityByRep to buildRoleMetrics'
// DTO) is DEFERRED and BUNDLED with the window-param edit (unit (i)) — both touch
// the same shared pinned functions, so the standing gate + FR-4.3 real-DB scope
// re-check is paid ONCE. Until then this section counts per-rep FIELD-AGGREGATE
// CONTRIBUTIONS (one per rep per field on the top-N types), NOT activities logged.
// It MUST NOT claim "activity volume" / "activities logged". A reader must not
// mistake the number for activity totals — so the heading + an explicit flag say so.
function renderByRep(d: AssembledDigest): string {
  const counts = new Map<string, { name: string; count: number }>();
  for (const fa of d.fieldAggregates) {
    for (const agg of fa.aggregates) {
      for (const rep of agg.perRep) {
        const prev = counts.get(rep.ownerId) ?? { name: rep.ownerName ?? rep.ownerId, count: 0 };
        prev.count += 1; // one field-aggregate contribution per rep per field — NOT activity count
        counts.set(rep.ownerId, prev);
      }
    }
  }
  const ranked = Array.from(counts.values()).sort((a, b) => b.count - a.count);

  const rows = ranked.length
    ? ranked
        .map(
          (r) => `<tr>
            <td style="padding:7px 28px;font-size:14px;color:#0f172a;font-family:${FONT_STACK};border-top:1px solid #f1f5f9;">${escHtml(r.name)}</td>
            <td align="right" style="padding:7px 28px;font-size:14px;font-weight:600;color:#0f172a;font-family:${FONT_STACK};border-top:1px solid #f1f5f9;">${r.count}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td style="padding:7px 28px;font-size:13px;color:#94a3b8;font-family:${FONT_STACK};">No rep field-contributions in scope.</td></tr>`;

  // Explicit flag (amber, like the demo banner) so the count is never read as
  // true activity volume.
  const flag = `<tr><td style="padding:2px 28px 6px;">
    <p style="margin:0;font-size:11px;font-weight:600;color:#92400e;font-family:${FONT_STACK};line-height:1.5;">
      &#9888; True per-rep activity volume pending &mdash; shown counts are custom-field
      contributions on the top types, NOT activities logged.
    </p></td></tr>`;

  return (
    sectionHeading("Reps active — by custom-field contribution") +
    flag +
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

// ── §4 Tasks — LOUD "NOT BUILT" placeholder (data is a separate unit) ─────────
function renderTasksPlaceholder(): string {
  return (
    sectionHeading("Tasks due / overdue") +
    `<tr><td style="padding:4px 28px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
        <tr><td style="padding:12px 14px;font-size:13px;font-weight:600;color:#b91c1c;font-family:${FONT_STACK};line-height:1.5;">
          &#9888; Tasks section not yet wired &mdash; placeholder, NOT &ldquo;zero tasks&rdquo;.
          The tasks query (forward-looking: due / overdue today) is a separate unit; this block shows
          the section LAYOUT only. Do not read absence here as &ldquo;no tasks due&rdquo;.
        </td></tr>
      </table>
    </td></tr>`
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
  const subject = assembled.isDemo
    ? "[DEMO] QuikCRM Activity Digest"
    : "QuikCRM Activity Digest";

  // Plain-text fallback (also makes the not-built/demo states explicit in text).
  const text = [
    assembled.isDemo ? assembled.demoBanner : "QuikCRM Activity Digest",
    "",
    `Prepared for: ${who}`,
    "",
    "Activity volume by rep / Activity mix by type / Per-rep field aggregates — see HTML.",
    "",
    "Tasks due / overdue: SECTION NOT YET WIRED — placeholder, not 'zero tasks'.",
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
          <span style="color:#93c5fd;font-size:13px;font-weight:400;margin-left:10px;font-family:${FONT_STACK};">Activity Digest</span>
        </td></tr>

        <!-- Prepared-for -->
        <tr><td style="padding:16px 28px 0;font-size:13px;color:#475569;font-family:${FONT_STACK};">
          Prepared for <strong style="color:#0f172a;">${escHtml(who)}</strong>
        </td></tr>

        ${renderDemoBanner(assembled)}
        ${renderByRep(assembled)}
        ${renderByType(assembled)}
        ${renderFieldAggregates(assembled)}
        ${renderTasksPlaceholder()}

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
