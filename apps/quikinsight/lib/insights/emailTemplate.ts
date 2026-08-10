// Email template that mirrors the /reports page exactly.
// Table-based layout + inline CSS only for email-client compatibility.

// ── Page colours (copy of CSS variables used on the page) ───────────────────
const BRAND       = "#4f46e5";
const BRAND_LIGHT = "#e0e7ff";
const BRAND_BADGE = "#c7d2fe";
const INK         = "#1a1d23";
const MUTED       = "#6b7280";
const BORDER      = "#e2e6ec";
const BG          = "#f4f6f9";   // --canvas  / page background
const SURFACE     = "#ffffff";   // --surface / card background
const ACCENT_50   = "#f0f1ff";
const ACCENT_200  = "#c7d2fe";

function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

// ── chart-card wrapper ───────────────────────────────────────────────────────
function chartCard(titleHtml: string, bodyHtml: string, accent = false): string {
  const bg     = accent ? ACCENT_50  : SURFACE;
  const border = accent ? ACCENT_200 : BORDER;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:${bg};border:1px solid ${border};border-radius:12px;margin-bottom:16px;">
    <tr><td style="padding:18px 20px;">
      ${titleHtml}
      ${bodyHtml}
    </td></tr>
  </table>`;
}

// ── SectionHead (title + optional sub) ──────────────────────────────────────
function sectionHead(title: string, sub = ""): string {
  return `<div style="display:inline-block;margin-bottom:12px;">
    <span style="font-size:15px;font-weight:700;color:${INK};margin-right:8px;">${esc(title)}</span>
    ${sub ? `<span style="font-size:12px;color:${MUTED};">${esc(sub)}</span>` : ""}
  </div>`;
}

// ── MetricRow (label left | bold value right) ────────────────────────────────
function metricRow(label: string, value: string, sub = ""): string {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid ${BORDER};font-size:13px;color:${MUTED};">${esc(label)}</td>
    <td style="padding:9px 0;border-bottom:1px solid ${BORDER};font-size:13px;font-weight:700;color:${INK};text-align:right;">
      ${esc(value)}${sub ? `<span style="font-size:11px;font-weight:400;color:${MUTED};margin-left:6px;">${esc(sub)}</span>` : ""}
    </td>
  </tr>`;
}

// ── BarRow (label | bar | value) ─────────────────────────────────────────────
function barRow(label: string, value: number, max: number, color: string): string {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<tr>
    <td style="padding:5px 0;font-size:12.5px;color:${INK};width:160px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(label)}</td>
    <td style="padding:5px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:8px;border-radius:4px;background:${BORDER};overflow:hidden;">
        <tr><td style="width:${w}%;background:${color};border-radius:4px;font-size:0;">&nbsp;</td><td></td></tr>
      </table>
    </td>
    <td style="padding:5px 0;font-size:12px;color:${MUTED};text-align:right;width:56px;">${fmt(value)}</td>
  </tr>`;
}

// ── KPI scorecard tiles (2 per row) ─────────────────────────────────────────
function kpiTiles(kpis: Array<{ label: string; value: string; delta?: string; trend?: string; sub?: string }>): string {
  if (!kpis.length) return "";
  const rows: string[] = [];
  for (let i = 0; i < kpis.length; i += 2) {
    const pair = kpis.slice(i, i + 2);
    const cells = pair.map((k) => {
      const dColor = k.trend === "up" ? "#16a34a" : k.trend === "down" ? "#dc2626" : MUTED;
      return `<td width="50%" valign="top" style="padding:6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="background:${BG};border-radius:10px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${esc(k.label)}</div>
            <div style="font-size:22px;font-weight:800;color:${INK};margin-top:6px;line-height:1.1;">${esc(k.value)}</div>
            ${k.delta ? `<div style="font-size:11px;font-weight:600;color:${dColor};margin-top:4px;">${esc(k.delta)}</div>` : ""}
            ${k.sub ? `<div style="font-size:11px;color:${MUTED};margin-top:2px;">${esc(k.sub)}</div>` : ""}
          </td></tr>
        </table>
      </td>`;
    }).join("");
    const pad = pair.length < 2 ? `<td width="50%"></td>` : "";
    rows.push(`<tr>${cells}${pad}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
}

// ── Insight pill (attention / decision / positive) ───────────────────────────
function insightPill(status: string, title: string, meta: string): string {
  const color = status === "attention" ? "#f59e0b" : status === "decision" ? "#6366f1" : "#22c55e";
  return `<tr><td style="padding:0 0 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:${BG};border-radius:10px;border-left:3px solid ${color};">
      <tr><td style="padding:14px 16px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${color};margin-bottom:5px;">${esc(status)}</div>
        <div style="font-size:13px;font-weight:600;color:${INK};line-height:1.4;margin-bottom:4px;">${esc(title)}</div>
        <div style="font-size:12px;color:${MUTED};">${esc(meta)}</div>
      </td></tr>
    </table>
  </td></tr>`;
}

// ── Data types mirroring the reports page state ──────────────────────────────
export interface EmailGA4Data {
  connected?: boolean;
  totalSessions?: number; totalUsers?: number; newUsers?: number;
  eventCount?: number; keyEvents?: number; avgEngagementTime?: number;
  channelBreakdown?: Array<{ channel: string; sessions: number; users: number }>;
  topPages?: Array<{ title: string; views: number }>;
}
export interface EmailGSCData {
  connected?: boolean;
  clicks?: number; impressions?: number; ctr?: string | number; avgPosition?: string | number;
  siteUrl?: string;
  topQueries?: Array<{ query: string; clicks: number; ctr: string | number; position: string | number }>;
}
export interface EmailKpi { label: string; value: string; delta?: string; trend?: string; sub?: string }
export interface EmailOrganicPlatform { name: string; followers: number; engagement: number; reach: number }
export interface EmailGooglePlatform { id: string; name: string; metrics: Array<{ label: string; value: string }> }
export interface EmailCrmData {
  connected?: boolean;
  totalContacts?: number; leads?: number;
  totalDeals?: number; openDeals?: number; wonDeals?: number; lostDeals?: number;
  pipeline?: number; revenue?: number; winRate?: number;
  stages?: Array<{ label: string; count: number; value: number }>;
}
export interface EmailInsight { id: string; title: string; meta: string; status: string }
export interface EmailTimesheetRow { user: string; avatar: string; month: string; hours: number; dummy?: boolean }

export interface ReportsPageData {
  kpis?: EmailKpi[];
  ga4?: EmailGA4Data;
  gsc?: EmailGSCData;
  organicPlatforms?: EmailOrganicPlatform[];
  googlePlatforms?: EmailGooglePlatform[];
  crm?: EmailCrmData;
  insights?: EmailInsight[];
  timesheet?: EmailTimesheetRow[];
  periodLabel: string;
  generatedAt: string;
}

export interface RenderOptions {
  recipientName?: string | null;
  appUrl: string;
}

export function renderInsightsEmail(
  data: ReportsPageData,
  opts: RenderOptions
): { subject: string; html: string } {
  const subject = `Marketing Performance Report · ${data.periodLabel}`;
  const settingsUrl = `${opts.appUrl.replace(/\/$/, "")}/settings`;
  const generatedAt = new Date(data.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const greeting = opts.recipientName ? `Hi ${esc(opts.recipientName)},` : "Hi,";

  const sections: string[] = [];

  // ── KPI scorecard ──────────────────────────────────────────────────────────
  if (data.kpis?.length) {
    sections.push(chartCard(
      sectionHead("Key Performance Indicators", data.periodLabel),
      kpiTiles(data.kpis)
    ));
  }

  // ── Website Analytics (GA4) ────────────────────────────────────────────────
  if (data.ga4?.connected) {
    const g = data.ga4;
    const pct = g.totalUsers ? `${Math.round(((g.newUsers ?? 0) / g.totalUsers) * 100)}% of all` : "";
    const eng = `${Math.floor((g.avgEngagementTime ?? 0) / 60)}m ${Math.round((g.avgEngagementTime ?? 0) % 60)}s`;
    const topCh = g.channelBreakdown?.slice().sort((a, b) => b.sessions - a.sessions)[0];
    let rows = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${metricRow("Total Sessions", fmt(g.totalSessions ?? 0))}
      ${metricRow("Total Users", fmt(g.totalUsers ?? 0))}
      ${metricRow("New Users", fmt(g.newUsers ?? 0), pct)}
      ${metricRow("Event Count", fmt(g.eventCount ?? 0))}
      ${metricRow("Key Events", fmt(g.keyEvents ?? 0))}
      ${metricRow("Avg. Engagement Time", eng)}
    </table>`;
    if (topCh) rows += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:${BG};border-radius:8px;"><tr><td style="padding:10px 12px;">
      <div style="font-size:11px;color:${MUTED};margin-bottom:4px;">Top traffic channel</div>
      <div style="font-size:14px;font-weight:700;color:${INK};">${esc(topCh.channel)}</div>
      <div style="font-size:12px;color:${MUTED};">${fmt(topCh.sessions)} sessions · ${fmt(topCh.users)} users</div>
    </td></tr></table>`;
    sections.push(chartCard(sectionHead("Website Analytics", "Google Analytics 4"), rows));
  }

  // ── Search Performance (GSC) ───────────────────────────────────────────────
  if (data.gsc?.connected) {
    const g = data.gsc;
    let rows = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${metricRow("Total Clicks", fmt(Number(g.clicks ?? 0)))}
      ${metricRow("Total Impressions", fmt(Number(g.impressions ?? 0)))}
      ${metricRow("Avg. CTR", `${Number(g.ctr ?? 0).toFixed(1)}%`)}
      ${metricRow("Avg. Position", String(g.avgPosition ?? "—"), "lower = better")}
    </table>`;
    if (g.siteUrl) rows += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:${BG};border-radius:8px;"><tr><td style="padding:10px 12px;">
      <div style="font-size:11px;color:${MUTED};margin-bottom:2px;">Property</div>
      <div style="font-size:12.5px;font-weight:600;color:${INK};word-break:break-all;">${esc(g.siteUrl)}</div>
    </td></tr></table>`;
    sections.push(chartCard(sectionHead("Search Performance", "Google Search Console"), rows));
  }

  // ── Traffic by channel ─────────────────────────────────────────────────────
  if ((data.ga4?.channelBreakdown?.length ?? 0) > 0) {
    const sorted = [...data.ga4!.channelBreakdown!].sort((a, b) => b.sessions - a.sessions);
    const maxS = sorted[0].sessions;
    const rows = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${sorted.slice(0, 7).map((ch) => barRow(ch.channel, ch.sessions, maxS, "#4285F4")).join("")}
    </table>`;
    sections.push(chartCard(sectionHead("Traffic by Channel", "Sessions"), rows));
  }

  // ── Top pages ──────────────────────────────────────────────────────────────
  if ((data.ga4?.topPages?.length ?? 0) > 0) {
    const maxPV = Math.max(...data.ga4!.topPages!.map((p) => p.views), 1);
    const rows = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <th style="padding:5px 6px;text-align:left;font-weight:600;color:${MUTED};font-size:11px;">Page</th>
        <th style="padding:5px 6px;text-align:right;font-weight:600;color:${MUTED};font-size:11px;">Views</th>
      </tr>
      ${data.ga4!.topPages!.slice(0, 8).map((p) => `<tr style="border-bottom:1px solid ${BORDER};">
        <td style="padding:7px 6px;font-size:12.5px;color:${INK};max-width:300px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(p.title)}</td>
        <td style="padding:7px 6px;text-align:right;font-size:12px;color:${MUTED};">${fmt(p.views)}</td>
      </tr>`).join("")}
    </table>`;
    sections.push(chartCard(sectionHead("Top Pages by Views"), rows));
  }

  // ── Top search queries ─────────────────────────────────────────────────────
  if ((data.gsc?.topQueries?.length ?? 0) > 0) {
    const rows = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${["Query","Clicks","CTR","Pos."].map((h) =>
          `<th style="padding:5px 6px;text-align:${h==="Query"?"left":"right"};font-weight:600;color:${MUTED};font-size:11px;">${h}</th>`
        ).join("")}
      </tr>
      ${data.gsc!.topQueries!.slice(0, 8).map((q) => `<tr style="border-bottom:1px solid ${BORDER};">
        <td style="padding:7px 6px;font-size:12.5px;color:${INK};max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(q.query)}</td>
        <td style="padding:7px 6px;text-align:right;font-size:12px;color:${MUTED};">${q.clicks}</td>
        <td style="padding:7px 6px;text-align:right;font-size:12px;color:${MUTED};">${Number(q.ctr).toFixed(1)}%</td>
        <td style="padding:7px 6px;text-align:right;font-size:12px;color:${MUTED};">${Number(q.position).toFixed(1)}</td>
      </tr>`).join("")}
    </table>`;
    sections.push(chartCard(sectionHead("Top Search Queries", "by clicks"), rows));
  }

  // ── Social Platforms ───────────────────────────────────────────────────────
  if ((data.organicPlatforms?.length ?? 0) > 0) {
    const rows = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${["Platform","Followers","Engagement","Reach"].map((h) =>
          `<th style="padding:5px 6px;text-align:${h==="Platform"?"left":"right"};font-weight:600;color:${MUTED};font-size:11px;">${h}</th>`
        ).join("")}
      </tr>
      ${data.organicPlatforms!.map((p) => `<tr style="border-bottom:1px solid ${BORDER};">
        <td style="padding:7px 6px;font-size:12.5px;font-weight:600;color:${INK};">${esc(p.name)}</td>
        <td style="padding:7px 6px;text-align:right;font-size:12px;color:${MUTED};">${fmt(p.followers)}</td>
        <td style="padding:7px 6px;text-align:right;font-size:12px;color:${MUTED};">${fmt(p.engagement)}</td>
        <td style="padding:7px 6px;text-align:right;font-size:12px;color:${MUTED};">${fmt(p.reach)}</td>
      </tr>`).join("")}
    </table>`;
    sections.push(chartCard(sectionHead("Social Platforms", "Organic performance"), rows));
  }

  // ── Google platform cards (YouTube etc.) ──────────────────────────────────
  for (const gp of data.googlePlatforms ?? []) {
    const rows = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${gp.metrics.map((m) => metricRow(m.label, m.value)).join("")}
    </table>`;
    sections.push(chartCard(sectionHead(gp.name), rows));
  }

  // ── CRM & Leads ───────────────────────────────────────────────────────────
  if (data.crm?.connected) {
    const c = data.crm;
    let rows = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${metricRow("Total Contacts", fmt(c.totalContacts ?? 0))}
      ${metricRow("New Leads (7d)", fmt(c.leads ?? 0))}
      ${metricRow("Total Deals", fmt(c.totalDeals ?? 0), `${c.openDeals ?? 0} open · ${c.wonDeals ?? 0} won · ${c.lostDeals ?? 0} lost`)}
      ${metricRow("Pipeline Value", `$${fmt(c.pipeline ?? 0)}`)}
      ${metricRow("Revenue (Closed Won)", `$${fmt(c.revenue ?? 0)}`)}
      ${metricRow("Win Rate", `${c.winRate ?? 0}%`)}
    </table>`;
    if (c.stages?.length) {
      const maxCount = Math.max(...c.stages.map((s) => s.count), 1);
      rows += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${MUTED};margin:14px 0 6px;">Deals by Stage</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${c.stages.map((s) => barRow(s.label, s.count, maxCount, BRAND)).join("")}
        </table>`;
    }
    sections.push(chartCard(sectionHead("CRM & Leads", "HubSpot"), rows));
  }

  // ── Marketing Team Timesheet ──────────────────────────────────────────────
  if ((data.timesheet?.length ?? 0) > 0) {
    const TARGET = 160;
    const memberPeriods: Record<string, Record<string, number>> = {};
    const memberAvatar: Record<string, string> = {};
    for (const r of data.timesheet!) {
      memberPeriods[r.user] ??= {};
      memberPeriods[r.user][r.month] = (memberPeriods[r.user][r.month] ?? 0) + r.hours;
      memberAvatar[r.user] = r.avatar;
    }
    const members = Object.entries(memberPeriods).map(([name, periods]) => {
      const totalHrs = Object.values(periods).reduce((s, h) => s + h, 0);
      const periodCount = Object.keys(periods).length;
      const avgHrs = periodCount > 0 ? totalHrs / periodCount : 0;
      const met = avgHrs >= TARGET;
      return { name, avatar: memberAvatar[name], totalHrs, periodCount, avgHrs, met };
    }).sort((a, b) => b.totalHrs - a.totalHrs);

    const totalHrs = members.reduce((s, m) => s + m.totalHrs, 0);
    const metCount = members.filter((m) => m.met).length;

    // Summary strip
    const summaryStrip = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        ${[{label:"TOTAL HOURS",val:totalHrs.toFixed(1)},{label:"MEMBERS",val:String(members.length)},{label:"ON TARGET (160H/MO)",val:`${metCount} / ${members.length}`}].map((s) =>
          `<td style="padding:10px 16px;background:${BG};border-radius:8px;margin-right:8px;min-width:100px;">
            <div style="font-size:10px;color:${MUTED};font-weight:700;text-transform:uppercase;letter-spacing:.05em;">${s.label}</div>
            <div style="font-size:20px;font-weight:800;color:${INK};margin-top:2px;">${s.val}</div>
          </td><td width="8"></td>`
        ).join("")}
      </tr>
    </table>`;

    // Member table
    const memberRows = members.map((m) => {
      const short = (TARGET - m.avgHrs).toFixed(1);
      const badge = m.met
        ? `<span style="display:inline-block;background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">✓ Met</span>`
        : `<span style="display:inline-block;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">✗ ${short}h short</span>`;
      return `<tr style="border-bottom:1px solid ${BORDER};">
        <td style="padding:9px 10px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:30px;height:30px;border-radius:50%;background:${BRAND};text-align:center;vertical-align:middle;">
              <span style="font-size:11px;font-weight:700;color:#fff;">${esc(m.avatar)}</span>
            </td>
            <td style="padding-left:8px;font-size:13px;font-weight:600;color:${INK};">${esc(m.name)}</td>
          </tr></table>
        </td>
        <td style="padding:9px 10px;text-align:center;font-size:13px;color:${MUTED};">${m.periodCount}</td>
        <td style="padding:9px 10px;text-align:center;font-size:13px;font-weight:700;color:${INK};">${m.totalHrs.toFixed(1)}h</td>
        <td style="padding:9px 10px;text-align:center;font-size:13px;color:${MUTED};">${m.avgHrs.toFixed(1)}h</td>
        <td style="padding:9px 10px;text-align:right;">${badge}</td>
      </tr>`;
    }).join("");

    const tableHtml = `${summaryStrip}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr style="border-bottom:2px solid ${BORDER};">
        ${["Member","Months logged","Total hrs","Avg / month","Target (160h/mo)"].map((h,i) =>
          `<th style="padding:7px 10px;text-align:${i===0?"left":i===4?"right":"center"};font-weight:600;color:${MUTED};font-size:11px;white-space:nowrap;">${h}</th>`
        ).join("")}
      </tr>
      ${memberRows}
    </table>`;

    sections.push(chartCard(sectionHead("Marketing Team Timesheet", "QuikProject · Marketing team only"), tableHtml));
  }

  // ── AI Insights ───────────────────────────────────────────────────────────
  if ((data.insights?.length ?? 0) > 0) {
    const pills = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${data.insights!.slice(0, 6).map((i) => insightPill(i.status, i.title, i.meta)).join("")}
    </table>`;
    sections.push(chartCard(
      sectionHead("AI Insights & Recommendations", `${data.insights!.length} active signals`),
      pills
    ));
  }

  const bodyHtml = sections.length
    ? sections.join("")
    : chartCard("", `<p style="font-size:14px;color:${MUTED};margin:0;">No connected platforms — connect a platform to start receiving insights.</p>`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:28px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header banner — accent-50 + accent-200 border, matches reports page banner -->
  <tr><td style="padding-bottom:16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:${ACCENT_50};border:1px solid ${ACCENT_200};border-radius:14px;">
      <tr><td style="padding:22px 24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:${BRAND};text-transform:uppercase;margin-bottom:4px;">Marketing Performance Report</div>
        <div style="font-size:22px;font-weight:800;color:${INK};">${esc(data.periodLabel)}</div>
        <div style="font-size:13px;color:${MUTED};margin-top:4px;">Generated ${esc(generatedAt)}</div>
        <div style="margin-top:10px;font-size:14px;color:${INK};">${greeting}</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- All report sections -->
  <tr><td>${bodyHtml}</td></tr>

  <!-- Footer -->
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

// Keep InsightsReport import satisfied for any other callers
export type { InsightsReport } from "@/lib/insights/types";
