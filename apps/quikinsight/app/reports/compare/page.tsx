"use client";

/**
 * Report comparison — Phase 3 of the report snapshot/comparison feature (see
 * PHASE_LOG.md). Pick two dates a saved report was snapshotted on, see a
 * side-by-side KPI delta. Every number here comes from stored QiReportSnapshot
 * rows (Phase 2) — nothing on this page ever calls a connector or a live
 * data endpoint.
 *
 * New, standalone page. Does not import from or modify
 * app/reports/generated/page.tsx — the KPI tile markup below intentionally
 * mirrors that page's visual style (same class names / values) since there is
 * no shared component to import without editing that file.
 */
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useToastStore } from "@/store/useToastStore";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { computeKpiDeltas, type ComparisonKpiRow, type SnapshotKpi } from "@/lib/reports/compare";

interface SnapshotListItem {
  id: string;
  snapshotDate: string;
  generatedAt: string;
}

interface SnapshotDetail {
  id: string;
  snapshotDate: string;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  kind: "dashboard" | "insights-report" | "unknown";
  kpis: SnapshotKpi[];
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ComparePage() {
  const showToast = useToastStore((s) => s.show);
  const { data: session } = useSession();
  const printRef = useRef<HTMLDivElement>(null);

  const [reportId, setReportId] = useState<string | null>(null);
  const [reportName, setReportName] = useState<string>("");

  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);

  const [dateAId, setDateAId] = useState<string>("");
  const [dateBId, setDateBId] = useState<string>("");

  const [snapA, setSnapA] = useState<SnapshotDetail | null>(null);
  const [snapB, setSnapB] = useState<SnapshotDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const [sending, setSending] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [emailToTags, setEmailToTags] = useState<string[]>([]);
  const [emailToDraft, setEmailToDraft] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    setReportId(id);
    if (!id) { setListLoading(false); return; }

    fetch(`/api/reports/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => { if (j?.success) setReportName(j.data.name ?? ""); })
      .catch(() => { /* header just stays generic */ });

    setListLoading(true);
    fetch(`/api/reports/${encodeURIComponent(id)}/snapshots`)
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) { setListError(true); return; }
        const items = j.data as SnapshotListItem[];
        setSnapshots(items);
        setListError(false);
        // Default: most recent two distinct dates, newest as B (right column).
        if (items.length >= 2) { setDateBId(items[0].id); setDateAId(items[1].id); }
        else if (items.length === 1) { setDateAId(items[0].id); }
      })
      .catch(() => setListError(true))
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    if (!reportId || !dateAId || !dateBId) { setSnapA(null); setSnapB(null); return; }
    setDetailLoading(true);
    setDetailError(false);
    Promise.all([
      fetch(`/api/reports/${encodeURIComponent(reportId)}/snapshot/${encodeURIComponent(dateAId)}`).then((r) => r.json()),
      fetch(`/api/reports/${encodeURIComponent(reportId)}/snapshot/${encodeURIComponent(dateBId)}`).then((r) => r.json()),
    ])
      .then(([ja, jb]) => {
        if (!ja?.success || !jb?.success) { setDetailError(true); return; }
        setSnapA(ja.data);
        setSnapB(jb.data);
      })
      .catch(() => setDetailError(true))
      .finally(() => setDetailLoading(false));
  }, [reportId, dateAId, dateBId]);

  const rows: ComparisonKpiRow[] =
    snapA?.kind === "dashboard" && snapB?.kind === "dashboard"
      ? computeKpiDeltas(snapA.kpis, snapB.kpis)
      : [];

  const eitherUncomparable =
    (snapA && snapA.kind !== "dashboard") || (snapB && snapB.kind !== "dashboard");

  async function sendComparison() {
    const toFromDraft = emailToDraft.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const to = [...emailToTags, ...toFromDraft.filter((e) => !emailToTags.includes(e))];
    if (!to.length) { showToast("Add at least one recipient"); return; }
    if (!reportId || !dateAId || !dateBId) return;
    setSending(true);
    setEmailModal(false);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/compare/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, snapshotAId: dateAId, snapshotBId: dateBId }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.sent) showToast(`Comparison emailed to ${(d.recipients ?? to).join(", ")}`);
      else showToast(d.error || "Couldn't send comparison");
    } catch {
      showToast("Failed to send comparison");
    } finally {
      setSending(false);
    }
  }

  function commitToTag(raw: string) {
    const emails = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) return;
    setEmailToTags((prev) => [...prev, ...emails.filter((e) => !prev.includes(e))]);
    setEmailToDraft("");
  }

  if (!reportId) {
    return (
      <NotConnected
        icon="📊"
        title="No report selected"
        body="Open a saved report and choose “Compare” to see it here."
        ctaHref="/reports"
        ctaLabel="Go to Reports"
      />
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Compare Report</div>
          <p className="page-sub">{reportName || "Compare two snapshots of the same report"}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" onClick={() => window.print()} type="button" disabled={!snapA || !snapB}>Print / PDF</button>
          <button
            className="btn btn-primary"
            onClick={() => { setEmailToTags(session?.user?.email ? [session.user.email] : []); setEmailToDraft(""); setEmailModal(true); }}
            disabled={sending || !snapA || !snapB || rows.length === 0}
            type="button"
          >
            {sending ? "Sending…" : "Email comparison"}
          </button>
        </div>
      </div>

      {emailModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEmailModal(false); }}
        >
          <div style={{ background: "var(--canvas)", borderRadius: 14, padding: 28, width: 420, maxWidth: "90vw", boxShadow: "0 8px 40px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Email comparison</h3>
              <button onClick={() => setEmailModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 20, lineHeight: 1, padding: 2 }} aria-label="Close">×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                To<span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>
              </label>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "text", minHeight: 40 }}
                onClick={(e) => { const inp = (e.currentTarget as HTMLDivElement).querySelector("input"); inp?.focus(); }}
              >
                {emailToTags.map((tag) => (
                  <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "2px 8px", borderRadius: 20, background: "var(--accent-100, #e0e7ff)", color: "var(--accent-700, #4338ca)", fontWeight: 500 }}>
                    {tag}
                    <button
                      onClick={() => setEmailToTags((prev) => prev.filter((t) => t !== tag))}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit", fontSize: 14, opacity: 0.7 }}
                      aria-label={`Remove ${tag}`}
                    >×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={emailToDraft}
                  onChange={(e) => setEmailToDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === ";") { e.preventDefault(); commitToTag(emailToDraft); }
                    if (e.key === "Backspace" && !emailToDraft && emailToTags.length) setEmailToTags((prev) => prev.slice(0, -1));
                  }}
                  onBlur={() => commitToTag(emailToDraft)}
                  placeholder={emailToTags.length ? "" : "email@example.com"}
                  style={{ flex: 1, minWidth: 140, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--text-primary)", padding: "2px 2px" }}
                />
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>Press Enter or comma to add each address.</p>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setEmailModal(false)} type="button">Cancel</button>
              <button className="btn btn-primary" onClick={sendComparison} type="button">Send comparison</button>
            </div>
          </div>
        </div>
      )}

      {listLoading ? (
        <SkeletonCard lines={6} />
      ) : listError ? (
        <NotConnected icon="⚠️" title="Couldn't load snapshots" body="Something went wrong reaching the server. Please refresh and try again." />
      ) : snapshots.length === 0 ? (
        <NotConnected
          icon="📊"
          title="No snapshots yet"
          body="This report hasn't been generated or sent yet, so there's nothing to compare. Snapshots are recorded automatically each time it's viewed or emailed."
        />
      ) : snapshots.length === 1 ? (
        <NotConnected
          icon="📊"
          title="Only one snapshot so far"
          body="Comparison needs at least two dates. Come back after this report is generated or sent again on a different day."
        />
      ) : (
        <div ref={printRef} className="report-card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="chart-card">
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", marginBottom: 6 }}>Date A</label>
                <select
                  value={dateAId}
                  onChange={(e) => setDateAId(e.target.value)}
                  style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)" }}
                >
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === dateBId}>{fmtDate(s.snapshotDate)}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", marginBottom: 6 }}>Date B</label>
                <select
                  value={dateBId}
                  onChange={(e) => setDateBId(e.target.value)}
                  style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)" }}
                >
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === dateAId}>{fmtDate(s.snapshotDate)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {detailLoading ? (
            <SkeletonCard lines={6} />
          ) : detailError ? (
            <NotConnected icon="⚠️" title="Couldn't load one of the selected snapshots" body="Please try a different date." />
          ) : eitherUncomparable ? (
            <NotConnected
              icon="📊"
              title="This snapshot can't be compared"
              body="One of the selected dates was recorded from a scheduled email send, which stores a different report format than the on-screen view. Pick a date recorded from viewing the report on-screen instead."
            />
          ) : snapA && snapB ? (
            <div className="chart-card">
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Key Performance Indicators</h3>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(snapA.snapshotDate)} vs {fmtDate(snapB.snapshotDate)}</span>
              </div>
              {rows.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No matching KPIs between these two snapshots.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      <th style={{ padding: "7px 6px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>KPI</th>
                      <th style={{ padding: "7px 6px", textAlign: "right", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>{fmtDate(snapA.snapshotDate)}</th>
                      <th style={{ padding: "7px 6px", textAlign: "right", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>{fmtDate(snapB.snapshotDate)}</th>
                      <th style={{ padding: "7px 6px", textAlign: "right", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "9px 6px", color: "var(--text-primary)", fontWeight: 600 }}>{r.label}</td>
                        <td style={{ padding: "9px 6px", textAlign: "right", color: "var(--text-muted)" }}>{r.aValue ?? "—"}</td>
                        <td style={{ padding: "9px 6px", textAlign: "right", color: "var(--text-primary)", fontWeight: 700 }}>{r.bValue ?? "—"}</td>
                        <td style={{ padding: "9px 6px", textAlign: "right" }}>
                          {r.deltaPct == null ? (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          ) : (
                            <span style={{ fontWeight: 700, color: r.deltaPct > 0 ? "#16a34a" : r.deltaPct < 0 ? "#dc2626" : "var(--text-muted)" }}>
                              {r.deltaPct > 0 ? "▲" : r.deltaPct < 0 ? "▼" : "–"} {Math.abs(r.deltaPct).toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "8px 0 4px" }}>
            QuikInsight AI Growth OS
          </div>
        </div>
      )}
    </div>
  );
}
