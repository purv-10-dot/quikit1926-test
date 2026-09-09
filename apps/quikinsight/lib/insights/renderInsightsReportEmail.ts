/**
 * Email renderer for InsightsReport — the rule-based, section/block/card
 * shape buildReportForUser + generateInsights produce (see lib/insights/
 * types.ts, lib/insights/generator.ts). Used ONLY by the scheduled cron send
 * (app/api/cron/insights/route.ts).
 *
 * Deliberately separate from lib/insights/emailTemplate.ts's
 * renderInsightsEmail, which renders a structurally different shape,
 * ReportsPageData (flat kpis/ga4/gsc/organicPlatforms/... fields) — the one
 * buildEmailReport.ts assembles for the manual "Email report" send. Passing
 * an InsightsReport into that function silently produced "No connected
 * platforms" for every scheduled send, since none of its conditions read a
 * field InsightsReport actually has (see PHASE_LOG.md 2026-09-09 entries for
 * the full investigation). Fixing that by building a NEW renderer — rather
 * than editing renderInsightsEmail or adapting InsightsReport into
 * ReportsPageData — keeps the manual send path (which works correctly
 * today) completely untouched, and avoids lossily discarding
 * InsightsReport's own summary/suggestions text, which ReportsPageData has
 * no field for at all.
 *
 * Table-based layout + inline CSS only, matching emailTemplate.ts, for
 * email-client compatibility.
 */

import type { InsightsReport, ReportSection, PlatformBlock, MetricCard } from "@/lib/insights/types";

// Same palette as emailTemplate.ts, so the two emails read as one system.
const BRAND       = "#4f46e5";
const INK         = "#1a1d23";
const MUTED       = "#6b7280";
const BORDER      = "#e2e6ec";
const BG          = "#f4f6f9";
const SURFACE     = "#ffffff";
const ACCENT_50   = "#f0f1ff";
const ACCENT_200  = "#c7d2fe";

function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── chart-card wrapper — identical shape to emailTemplate.ts's, so a section
// here looks like a section there. Accepts a `border`/`bg` override so a
// section can carry its own accent color (ReportSection.accent) rather than
// the flat SURFACE/BORDER every emailTemplate.ts card uses.
function chartCard(titleHtml: string, bodyHtml: string, accentBg = SURFACE, accentBorder = BORDER): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:${accentBg};border:1px solid ${accentBorder};border-radius:12px;margin-bottom:16px;">
    <tr><td style="padding:18px 20px;">
      ${titleHtml}
      ${bodyHtml}
    </td></tr>
  </table>`;
}

function sectionHead(title: string, emoji: string, sub = ""): string {
  return `<div style="display:inline-block;margin-bottom:12px;">
    <span style="font-size:15px;font-weight:700;color:${INK};margin-right:8px;">${esc(emoji)} ${esc(title)}</span>
    ${sub ? `<span style="font-size:12px;color:${MUTED};">${esc(sub)}</span>` : ""}
  </div>`;
}

// ── One MetricCard → one tile. Mirrors emailTemplate.ts's kpiTiles visual
// language (label / big value / delta / hint), 2 per row.
function metricCardTiles(cards: MetricCard[]): string {
  if (!cards.length) return "";
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    const pair = cards.slice(i, i + 2);
    const cells = pair.map((c) => {
      const dColor = c.deltaDirection === "up" ? "#16a34a" : c.deltaDirection === "down" ? "#dc2626" : MUTED;
      return `<td width="50%" valign="top" style="padding:6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="background:${BG};border-radius:10px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${esc(c.label)}</div>
            <div style="font-size:22px;font-weight:800;color:${INK};margin-top:6px;line-height:1.1;">${esc(c.value)}</div>
            ${c.delta ? `<div style="font-size:11px;font-weight:600;color:${dColor};margin-top:4px;">${esc(c.delta)}</div>` : ""}
            ${c.hint ? `<div style="font-size:11px;color:${MUTED};margin-top:2px;">${esc(c.hint)}</div>` : ""}
          </td></tr>
        </table>
      </td>`;
    }).join("");
    const pad = pair.length < 2 ? `<td width="50%"></td>` : "";
    rows.push(`<tr>${cells}${pad}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
}

// ── One PlatformBlock → its own sub-heading + either metric tiles or a
// dataUnavailable/note line. A block with zero cards and no note (shouldn't
// happen per generator.ts, but not assumed) renders nothing rather than an
// empty shell.
function platformBlockHtml(block: PlatformBlock): string {
  const heading = `<div style="font-size:12.5px;font-weight:700;color:${INK};margin:14px 0 8px;">${esc(block.platform)}</div>`;
  if (block.dataUnavailable || block.cards.length === 0) {
    const note = block.note
      ? `<p style="font-size:12.5px;color:${MUTED};margin:0 0 4px;">${esc(block.note)}</p>`
      : block.cards.length === 0
        ? `<p style="font-size:12.5px;color:${MUTED};margin:0 0 4px;">No data available for this period.</p>`
        : "";
    return note ? heading + note : "";
  }
  const note = block.note ? `<p style="font-size:12px;color:${MUTED};margin:0 0 8px;">${esc(block.note)}</p>` : "";
  return heading + note + metricCardTiles(block.cards);
}

// ── Suggestions list — rule-based recommendations, rendered as a simple
// bulleted list. ReportsPageData/renderInsightsEmail has no equivalent field
// at all, so this content was previously always discarded on scheduled sends.
function suggestionsHtml(suggestions: string[]): string {
  if (!suggestions.length) return "";
  const items = suggestions
    .map((s) => `<li style="font-size:12.5px;color:${INK};margin-bottom:4px;">${esc(s)}</li>`)
    .join("");
  return `<ul style="margin:12px 0 0;padding-left:18px;">${items}</ul>`;
}

// ── One ReportSection → one accent-colored chart-card containing its
// summary, every platform block, and its suggestions.
function sectionHtml(section: ReportSection): string {
  const blocksHtml = section.blocks.length
    ? section.blocks.map(platformBlockHtml).filter(Boolean).join("")
    : `<p style="font-size:12.5px;color:${MUTED};margin:0;">No platforms with data in this group yet.</p>`;

  const body = `
    ${section.summary ? `<p style="font-size:13.5px;color:${INK};line-height:1.6;margin:0 0 4px;">${esc(section.summary)}</p>` : ""}
    ${blocksHtml}
    ${suggestionsHtml(section.suggestions)}
  `;

  // Light accent tint derived from the section's own accent color — kept
  // subtle (a fixed light background, not computed from the hex) so this
  // stays legible in every email client rather than relying on color-mixing
  // functions inline CSS can't reliably do.
  return chartCard(sectionHead(section.title, section.emoji, ""), body, BG, section.accent);
}

export interface RenderOptions {
  recipientName?: string | null;
  appUrl: string;
}

/**
 * Renders a full InsightsReport (buildReportForUser's return value) into
 * scheduled-send email HTML. Never called with report.empty === true by its
 * only caller (app/api/cron/insights/route.ts already skips sending in that
 * case, same as before) — but handles it gracefully regardless, matching
 * renderInsightsEmail's own "nothing connected" fallback text so the two
 * renderers stay consistent if this is ever reached.
 */
export function renderInsightsReportEmail(
  report: InsightsReport,
  opts: RenderOptions,
): { subject: string; html: string } {
  const subject = `Marketing Performance Report · ${report.periodLabel}`;
  const settingsUrl = `${opts.appUrl.replace(/\/$/, "")}/settings`;
  const generatedAt = new Date(report.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const greeting = opts.recipientName ? `Hi ${esc(opts.recipientName)},` : "Hi,";

  const overallSummaryHtml = report.overallSummary
    ? chartCard("", `<p style="font-size:14.5px;line-height:1.7;color:${INK};margin:0;">${esc(report.overallSummary)}</p>`, ACCENT_50, ACCENT_200)
    : "";

  const sectionsHtml = report.sections.length
    ? report.sections.map(sectionHtml).join("")
    : "";

  const bodyHtml = report.sections.length
    ? overallSummaryHtml + sectionsHtml
    : chartCard("", `<p style="font-size:14px;color:${MUTED};margin:0;">No connected platforms — connect a platform to start receiving insights.</p>`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:28px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header banner — same accent-50 + accent-200 border as emailTemplate.ts's, so both emails match. -->
  <tr><td style="padding-bottom:16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:${ACCENT_50};border:1px solid ${ACCENT_200};border-radius:14px;">
      <tr><td style="padding:22px 24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:${BRAND};text-transform:uppercase;margin-bottom:4px;">Marketing Performance Report</div>
        <div style="font-size:22px;font-weight:800;color:${INK};">${esc(report.periodLabel)}</div>
        <div style="font-size:13px;color:${MUTED};margin-top:4px;">${esc(report.frequencyLabel)} · Generated ${esc(generatedAt)}</div>
        <div style="margin-top:10px;font-size:14px;color:${INK};">${greeting}</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- All report sections -->
  <tr><td>${bodyHtml}</td></tr>

  <!-- Footer — identical text to emailTemplate.ts's, so the two emails read as one product. -->
  <tr><td style="padding:8px 0 4px;">
    <p style="margin:0 0 4px;font-size:12px;color:${MUTED};">
      Generated automatically · <a href="${esc(settingsUrl)}" style="color:${BRAND};text-decoration:none;font-weight:600;">Manage settings</a>
    </p>
    <p style="margin:0;font-size:11px;color:#9aa1ac;">MoreYeahs Marketing Operating System</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  return { subject, html };
}
