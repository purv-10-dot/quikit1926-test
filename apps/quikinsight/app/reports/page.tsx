"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToastStore } from "@/store/useToastStore";

/**
 * Reports — the report LIBRARY, ported from the v15 UI preview.
 *
 * The preview reframes Reports from "one generated report" into a library of
 * saved, schedulable reports: a table of every report, then a detail view for
 * one. That is what this page now is.
 *
 * The previous page — the live GA4 / Search Console / CRM report with email
 * sending and print/PDF — was NOT deleted. It moved verbatim to
 * /reports/generated and is reachable from the "Marketing performance" row's
 * View button, which is the library's real, data-backed report. Deleting a
 * working feature was not part of the UI update.
 *
 * ⚠️ DEMO DATA: the report rows below (except the live one) are the preview's
 * seed data. There is no reports API in this app yet — creating, editing and
 * scheduling are UI-only until one exists, and the buttons say so rather than
 * pretending to have saved something.
 */

const REPORT_TYPES: Record<string, string> = {
  executive: "Executive summary",
  custom: "Custom",
};

const REPORT_RANGES: Record<string, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last 12 months",
};

const FREQUENCY_LABELS: Record<string, string> = {
  none: "Manual only",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

interface ReportRow {
  id: string;
  name: string;
  type: keyof typeof REPORT_TYPES | string;
  brand: string;
  range: string;
  audience: "internal" | "client";
  status: string;
  recipients: string[];
  frequency: string;
  createdAt: string;
  /** Set on the one report backed by real data — its View opens the live page. */
  href?: string;
  summary?: string;
}

const REPORTS: ReportRow[] = [
  {
    id: "rep1",
    name: "Marketing performance — July 2026",
    type: "executive",
    brand: "MoreYeahs",
    range: "30",
    audience: "internal",
    status: "Ready",
    recipients: ["vijay@moreyeahs.co", "jordan.lee@moreyeahs.co"],
    frequency: "weekly",
    createdAt: "Jul 28, 2026",
    // The live, data-backed report.
    href: "/reports/generated",
  },
];

export default function ReportsPage() {
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);
  const [detailId, setDetailId] = useState<string | null>(null);

  const detail = useMemo(() => REPORTS.find((r) => r.id === detailId) ?? null, [detailId]);

  function notImplemented() {
    showToast("Report scheduling isn't wired up yet — no reports API in this app.");
  }

  if (detail) {
    const scheduled = detail.frequency !== "none" && detail.recipients.length > 0;
    const footer = scheduled
      ? `Emailed ${FREQUENCY_LABELS[detail.frequency]?.toLowerCase()} to ${detail.recipients.length} recipient${detail.recipients.length > 1 ? "s" : ""} — ${detail.recipients.join(", ")}`
      : `Generated on ${detail.createdAt} — not scheduled to send automatically`;

    return (
      <div>
        <div className="page-head">
          <div>
            <button
              className="link"
              type="button"
              onClick={() => setDetailId(null)}
              style={{ marginBottom: 8, background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
            >
              ← Back to reports
            </button>
            <div className="page-title">{detail.name}</div>
            <p className="page-sub">
              {detail.brand} · {REPORT_RANGES[detail.range] ?? detail.range} · {REPORT_TYPES[detail.type] ?? detail.type}
              {detail.audience === "client" ? " · Client-facing" : " · Internal"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {detail.href && (
              <button className="btn" type="button" onClick={() => router.push(detail.href!)}>
                Open live report
              </button>
            )}
            <button className="btn" type="button" onClick={notImplemented}>Edit</button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                showToast('Opening print dialog — choose "Save as PDF" to export');
                setTimeout(() => window.print(), 300);
              }}
            >
              Export PDF
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                const link = `${window.location.origin}/r/${detail.id}`;
                navigator.clipboard?.writeText(link).catch(() => {});
                showToast(`Link copied: ${link}`);
              }}
            >
              Copy link
            </button>
          </div>
        </div>

        <div className="report-card">
          <div className="report-eyebrow">
            {(REPORT_TYPES[detail.type] ?? detail.type).toUpperCase()} · {detail.brand.toUpperCase()} —{" "}
            {(REPORT_RANGES[detail.range] ?? detail.range).toUpperCase()}
          </div>
          <h2 style={{ margin: "8px 0 14px" }}>{detail.name}</h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.75, margin: "0 0 20px" }}>
            {detail.summary ??
              "This report is generated from your connected platforms. Open the live report for the full Google Analytics, Search Console and CRM breakdown with current figures."}
          </p>
          {detail.href && (
            <button className="btn btn-primary" type="button" onClick={() => router.push(detail.href!)}>
              View full report →
            </button>
          )}
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "20px 0 0" }}>{footer}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Reports</div>
          <p className="page-sub">
            Build, schedule, and share branded reports per brand — no login required for viewers
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={notImplemented}>
          + New report
        </button>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Report</th>
              <th>Brand</th>
              <th>Type</th>
              <th>Date range</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {REPORTS.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "28px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  No reports yet.
                </td>
              </tr>
            ) : (
              REPORTS.map((r) => {
                const scheduled = r.frequency !== "none" && r.recipients.length > 0;
                return (
                  <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setDetailId(r.id)}>
                    <td style={{ fontWeight: 600 }}>
                      {r.name}
                      {scheduled && (
                        <span className="pill pill-neutral" style={{ marginLeft: 6, fontSize: 10, padding: "2px 7px" }}>
                          {FREQUENCY_LABELS[r.frequency]} · {r.recipients.length} recipient
                          {r.recipients.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td>{r.brand}</td>
                    <td>{REPORT_TYPES[r.type] ?? r.type}</td>
                    <td>{REPORT_RANGES[r.range] ?? r.range}</td>
                    <td><span className="pill pill-green" style={{ fontSize: 10.5 }}>{r.status}</span></td>
                    <td>{r.createdAt}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}
                      >
                        View →
                      </button>{" "}
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); notImplemented(); }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
