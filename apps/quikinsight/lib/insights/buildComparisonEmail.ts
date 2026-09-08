/**
 * Email template for the Phase 3 snapshot comparison view (see PHASE_LOG.md).
 *
 * Deliberately a SEPARATE function from lib/insights/emailTemplate.ts's
 * renderInsightsEmail — that one is the single source of truth for the
 * existing, working scheduled-send/manual-send email and must not change.
 * This file borrows its visual style (same colors, same table-based layout
 * for email-client compatibility) but renders a two-column KPI delta table,
 * a shape renderInsightsEmail has no concept of.
 *
 * Input is two already-fetched DashboardData-shaped snapshot KPI lists —
 * this module never fetches anything itself.
 */

import type { ComparisonKpiRow } from "@/lib/reports/compare";

const BRAND      = "#4f46e5";
const INK        = "#1a1d23";
const MUTED      = "#6b7280";
const BORDER     = "#e2e6ec";
const BG         = "#f4f6f9";
const SURFACE    = "#ffffff";
const ACCENT_50  = "#f0f1ff";
const ACCENT_200 = "#c7d2fe";
const UP         = "#16a34a";
const DOWN       = "#dc2626";

function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function deltaCell(row: ComparisonKpiRow): string {
  if (row.deltaPct == null) {
    return `<span style="font-size:12px;color:${MUTED};">—</span>`;
  }
  const color = row.deltaPct > 0 ? UP : row.deltaPct < 0 ? DOWN : MUTED;
  const arrow = row.deltaPct > 0 ? "▲" : row.deltaPct < 0 ? "▼" : "–";
  return `<span style="font-size:12px;font-weight:700;color:${color};">${arrow} ${Math.abs(row.deltaPct).toFixed(1)}%</span>`;
}

function kpiCompareRow(row: ComparisonKpiRow): string {
  return `<tr style="border-bottom:1px solid ${BORDER};">
    <td style="padding:9px 6px;font-size:13px;color:${INK};font-weight:600;">${esc(row.label)}</td>
    <td style="padding:9px 6px;font-size:13px;color:${MUTED};text-align:right;">${esc(row.aValue ?? "—")}</td>
    <td style="padding:9px 6px;font-size:13px;color:${INK};font-weight:700;text-align:right;">${esc(row.bValue ?? "—")}</td>
    <td style="padding:9px 6px;text-align:right;">${deltaCell(row)}</td>
  </tr>`;
}

export interface ComparisonEmailData {
  reportName: string;
  dateA: string;
  dateB: string;
  rows: ComparisonKpiRow[];
  generatedAt: string;
}

export interface RenderOptions {
  recipientName?: string | null;
  appUrl: string;
}

export function buildComparisonEmail(
  data: ComparisonEmailData,
  opts: RenderOptions,
): { subject: string; html: string } {
  const subject = `Report Comparison · ${esc(data.reportName)} · ${data.dateA} vs ${data.dateB}`;
  const generatedAt = new Date(data.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const greeting = opts.recipientName ? `Hi ${esc(opts.recipientName)},` : "Hi,";

  const tableHtml = data.rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr style="border-bottom:2px solid ${BORDER};">
          <th style="padding:7px 6px;text-align:left;font-weight:600;color:${MUTED};font-size:11px;">KPI</th>
          <th style="padding:7px 6px;text-align:right;font-weight:600;color:${MUTED};font-size:11px;">${esc(data.dateA)}</th>
          <th style="padding:7px 6px;text-align:right;font-weight:600;color:${MUTED};font-size:11px;">${esc(data.dateB)}</th>
          <th style="padding:7px 6px;text-align:right;font-weight:600;color:${MUTED};font-size:11px;">Change</th>
        </tr>
        ${data.rows.map(kpiCompareRow).join("")}
      </table>`
    : `<p style="font-size:13px;color:${MUTED};margin:0;">No matching KPIs between these two snapshots.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:28px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="padding-bottom:16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:${ACCENT_50};border:1px solid ${ACCENT_200};border-radius:14px;">
      <tr><td style="padding:22px 24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:${BRAND};text-transform:uppercase;margin-bottom:4px;">Report Comparison</div>
        <div style="font-size:22px;font-weight:800;color:${INK};">${esc(data.reportName)}</div>
        <div style="font-size:13px;color:${MUTED};margin-top:4px;">${esc(data.dateA)} vs ${esc(data.dateB)} · Generated ${esc(generatedAt)}</div>
        <div style="margin-top:10px;font-size:14px;color:${INK};">${greeting}</div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border:1px solid ${BORDER};border-radius:12px;margin-bottom:16px;">
      <tr><td style="padding:18px 20px;">${tableHtml}</td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:8px 0 4px;">
    <p style="margin:0;font-size:11px;color:#9aa1ac;">MoreYeahs Marketing Operating System</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  return { subject, html };
}
