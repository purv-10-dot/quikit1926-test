"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToastStore } from "@/store/useToastStore";
import { SkeletonCard } from "@/components/ui/Skeleton";

/**
 * Reports — a library of saved, shareable reports.
 *
 * Backed by QiReport via /api/reports: many reports per org, each with its own
 * brand (workspace), date range, channel mix, audience and recipient list.
 *
 * NOT the same thing as QiEmailReportSettings, which is the single legacy
 * per-user schedule the crons read. A report's `frequency` records intent
 * today; wiring the crons to these rows is the next step, so nothing here
 * claims a report was emailed unless `lastSentAt` says so.
 *
 * Clicking View opens /reports/generated?report=<id> — the live GA4 / Search
 * Console / CRM document, scoped to that report's saved range, channels and
 * metrics. There is no summary card in between: creating a report returns here,
 * and one click shows the real thing.
 */

const TYPES = [
  { id: "executive", label: "Executive summary" },
  { id: "custom", label: "Custom" },
] as const;

const RANGES = [
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
  { id: "365", label: "Last 12 months" },
] as const;

const CHANNELS = [
  { id: "paid", label: "Paid" },
  { id: "organic", label: "Organic" },
  { id: "email", label: "Email" },
  { id: "leads", label: "Leads / CRM" },
] as const;

const FREQUENCIES = [
  { id: "none", label: "Send manually only" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
] as const;

/** Metric catalogue for a Custom report, grouped as in the design. */
const METRICS: ReadonlyArray<{ id: string; label: string; group: string }> = [
  { id: "paid_pipeline", label: "Paid pipeline", group: "Paid" },
  { id: "paid_roas", label: "Paid ROAS", group: "Paid" },
  { id: "paid_spend", label: "Paid spend", group: "Paid" },
  { id: "organic_followers", label: "Followers", group: "Organic" },
  { id: "organic_engagement", label: "Engagement rate", group: "Organic" },
  { id: "organic_reach", label: "Reach", group: "Organic" },
  { id: "email_sends", label: "Emails sent", group: "Email" },
  { id: "email_open", label: "Open rate", group: "Email" },
  { id: "email_click", label: "Click rate", group: "Email" },
  { id: "leads_total", label: "Total leads", group: "Leads" },
  { id: "leads_qualified", label: "Qualified leads", group: "Leads" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Report {
  id: string;
  name: string;
  type: string;
  workspaceId: string | null;
  dateRange: string;
  channels: string[];
  audience: string;
  customSummary: string | null;
  customMetrics: string[];
  recipients: string[];
  frequency: string;
  /** Best-effort preferred send hour (0-23), local to `timezone`. Both must be set to take effect — see PHASE_LOG.md. */
  preferredHour: number | null;
  timezone: string | null;
  status: string;
  lastSentAt: string | null;
  createdAt: string;
}

/** Short list of common IANA zones — not exhaustive, just the common cases. */
const TIMEZONES = [
  { id: "", label: "No preference" },
  { id: "America/Los_Angeles", label: "Pacific Time (US)" },
  { id: "America/Denver", label: "Mountain Time (US)" },
  { id: "America/Chicago", label: "Central Time (US)" },
  { id: "America/New_York", label: "Eastern Time (US)" },
  { id: "UTC", label: "UTC" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Paris", label: "Paris / Berlin / Madrid" },
  { id: "Asia/Kolkata", label: "India (IST)" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Australia/Sydney", label: "Sydney" },
] as const;

interface Workspace { id: string; name: string }

const labelOf = (list: ReadonlyArray<{ id: string; label: string }>, id: string) =>
  list.find((x) => x.id === id)?.label ?? id;

/**
 * This system's one fixed daily schedule check (apps/quikinsight/vercel.json's
 * `/api/cron/insights` cron — "0 7 * * *"). A plain constant, not a live
 * lookup: display-only, so the preferred-time copy can show it converted into
 * whichever timezone the user picks, without adding any new logic/state.
 */
const DAILY_CHECK_UTC_HOUR = 7;

/** `DAILY_CHECK_UTC_HOUR` converted to a wall-clock hour in `timezone`, or `null` if it can't be computed (unrecognized zone). */
function dailyCheckHourIn(timezone: string): number | null {
  try {
    const check = new Date(Date.UTC(2000, 0, 1, DAILY_CHECK_UTC_HOUR));
    const hourStr = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(check);
    const h = Number(hourStr) % 24;
    return Number.isFinite(h) ? h : null;
  } catch {
    return null;
  }
}

function fmtHour12(h: number): string {
  return h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Blank draft for a new report — every channel on, nothing scheduled. */
function emptyDraft(workspaceId: string | null): Report {
  return {
    id: "", name: "", type: "executive", workspaceId, dateRange: "30",
    channels: CHANNELS.map((c) => c.id), audience: "internal",
    customSummary: "", customMetrics: [], recipients: [], frequency: "none",
    preferredHour: null, timezone: null,
    status: "Ready", lastSentAt: null, createdAt: "",
  };
}

export default function ReportsPage() {
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);

  const [reports, setReports] = useState<Report[] | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Report | null>(null); // non-null = modal open
  const [saving, setSaving] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    fetch("/api/reports")
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) throw new Error(j?.error ?? "Failed to load reports");
        setReports(j.data as Report[]);
      })
      .catch((e: unknown) => {
        setReports([]);
        setLoadError(e instanceof Error ? e.message : "Failed to load reports");
      });
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    // Same envelope + cookie convention the topbar switcher uses.
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success || !Array.isArray(j.data)) return;
        setWorkspaces(j.data);
        const cookieId = document.cookie.match(/(?:^|;\s*)qi_active_workspace=([^;]+)/)?.[1];
        setActiveWsId(
          (cookieId && j.data.find((w: Workspace) => w.id === cookieId)?.id) || j.data[0]?.id || null,
        );
      })
      .catch(() => {});
  }, []);

  const brandName = useCallback(
    (id: string | null) => workspaces.find((w) => w.id === id)?.name ?? "—",
    [workspaces],
  );

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setNameError("Report name is required."); return; }
    setNameError(null);
    if (draft.frequency !== "none" && draft.recipients.length === 0) {
      showToast("Add at least one recipient to schedule automatic sending");
      return;
    }
    setSaving(true);
    try {
      const editing = Boolean(draft.id);
      const res = await fetch(editing ? `/api/reports/${draft.id}` : "/api/reports", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await res.json();
      if (!res.ok || !j?.success) throw new Error(j?.error ?? "Save failed");
      showToast(editing ? "Report updated" : "Report created");
      setDraft(null);
      setRecipientDraft("");
      load();
      // Deliberately NOT opening anything: creating a report returns to the
      // library. The report is one click away on View, which goes straight to
      // the generated document — no summary card in between.
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Report) {
    if (!window.confirm(`Delete "${r.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/reports/${r.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Report deleted");
      load();
    } else {
      showToast("Could not delete the report");
    }
  }

  /** Open the generated document for a report, scoped to its saved config. */
  function openReport(id: string) {
    router.push(`/reports/generated?report=${encodeURIComponent(id)}`);
  }

  /** Open the snapshot comparison view for a report. */
  function openCompare(id: string) {
    router.push(`/reports/compare?report=${encodeURIComponent(id)}`);
  }

  function addRecipient() {
    const v = recipientDraft.trim().toLowerCase();
    if (!v) return;
    if (!EMAIL_RE.test(v)) { showToast("Enter a valid email address"); return; }
    setDraft((d) => (d && !d.recipients.includes(v) ? { ...d, recipients: [...d.recipients, v] } : d));
    setRecipientDraft("");
  }

  const grouped = useMemo(
    () =>
      METRICS.reduce<Record<string, Array<{ id: string; label: string; group: string }>>>((acc, m) => {
        (acc[m.group] ||= []).push(m);
        return acc;
      }, {}),
    [],
  );

  const modal = draft && (
    <div
      className="modal-overlay open"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) { setDraft(null); setNameError(null); } }}
    >
      <div className="modal-box" style={{ maxWidth: 520, maxHeight: "88vh", overflowY: "auto" }}>
        <p className="modal-title">{draft.id ? "Edit report" : "New report"}</p>
        <p className="modal-sub">
          Build a report scoped to a brand, date range, and channel mix — then share or schedule it.
        </p>

        <div className="modal-field">
          <label>Report name</label>
          <input
            className="ws-new-input" style={{ width: "100%" }}
            placeholder="e.g. Q3 board update"
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
              if (nameError) setNameError(null);
            }}
          />
        </div>

        <div className="modal-field">
          <label>Report type</label>
          <select className="range-select" style={{ width: "100%" }} value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        <div className="modal-field">
          <label>Brand</label>
          <select className="range-select" style={{ width: "100%" }} value={draft.workspaceId ?? ""}
            onChange={(e) => setDraft({ ...draft, workspaceId: e.target.value || null })}>
            {workspaces.length === 0 && <option value="">No workspaces</option>}
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        <div className="modal-field">
          <label>Date range</label>
          <select className="range-select" style={{ width: "100%" }} value={draft.dateRange}
            onChange={(e) => setDraft({ ...draft, dateRange: e.target.value })}>
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        {/* Channels scope an executive summary. A custom report picks metrics
            instead, so the channel list is hidden — otherwise a stale "all
            channels" selection would silently scope a report the user never
            configured that way. */}
        {draft.type !== "custom" ? (
          <div className="modal-field">
            <label>Channels to include</label>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", paddingTop: 2 }}>
              {CHANNELS.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={draft.channels.includes(c.id)}
                    onChange={(e) => setDraft({
                      ...draft,
                      channels: e.target.checked
                        ? [...draft.channels, c.id]
                        : draft.channels.filter((x) => x !== c.id),
                    })}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="modal-field">
            <label>Custom summary</label>
            <textarea
              className="ws-new-input" rows={3} style={{ width: "100%", resize: "vertical" }}
              placeholder="Write your own summary paragraph for this report…"
              value={draft.customSummary ?? ""}
              onChange={(e) => setDraft({ ...draft, customSummary: e.target.value })}
            />
            <label style={{ marginTop: 10 }}>Metrics to include</label>
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "8px 0 4px" }}>
                  {group}
                </p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {items.map((m) => (
                    <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={draft.customMetrics.includes(m.id)}
                        onChange={(e) => setDraft({
                          ...draft,
                          customMetrics: e.target.checked
                            ? [...draft.customMetrics, m.id]
                            : draft.customMetrics.filter((x) => x !== m.id),
                        })}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-field">
          <label>Audience</label>
          <select className="range-select" style={{ width: "100%" }} value={draft.audience}
            onChange={(e) => setDraft({ ...draft, audience: e.target.value })}>
            <option value="internal">Internal</option>
            <option value="client">Client-facing</option>
          </select>
        </div>

        <div className="modal-field">
          <label>Email recipients</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="ws-new-input" style={{ flex: 1 }} type="email"
              placeholder="name@company.com"
              value={recipientDraft}
              onChange={(e) => setRecipientDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
            />
            <button className="btn btn-sm" type="button" onClick={addRecipient}>Add</button>
          </div>
          {draft.recipients.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {draft.recipients.map((r) => (
                <span key={r} className="pill pill-neutral" style={{ fontSize: 11.5 }}>
                  {r}
                  <button
                    type="button"
                    aria-label={`Remove ${r}`}
                    onClick={() => setDraft({ ...draft, recipients: draft.recipients.filter((x) => x !== r) })}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 0 0 4px" }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="modal-field" style={{ marginBottom: draft.frequency !== "none" ? undefined : 0 }}>
          <label>Send frequency</label>
          <select className="range-select" style={{ width: "100%" }} value={draft.frequency}
            onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}>
            {FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          {draft.frequency !== "none" && draft.recipients.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--red)", margin: "8px 0 0" }}>
              Add at least one recipient, or keep it manual.
            </p>
          )}
        </div>

        {/* Best-effort preferred time — only meaningful once a schedule is
            set. Optional: leaving timezone at "No preference" (or hour
            unset) keeps this report on the plain daily/weekly/monthly
            schedule, exactly as before this feature existed.

            TEXT-ONLY copy below (plus dailyCheckHourIn/fmtHour12, pure
            display helpers reading the fixed DAILY_CHECK_UTC_HOUR constant)
            — no new state, no new save/validation logic. See PHASE_LOG.md:
            users were assuming "8 AM" meant delivery AT 8 AM; the hour is
            actually only a minimum guard against this system's one fixed
            daily check, so most chosen hours resolve to the same actual
            delivery time. */}
        {draft.frequency !== "none" && (() => {
          const checkHour = draft.timezone ? dailyCheckHourIn(draft.timezone) : null;
          const hourIsAfterCheck = draft.timezone && checkHour != null && draft.preferredHour != null && draft.preferredHour > checkHour;
          return (
            <div className="modal-field" style={{ marginBottom: 0 }}>
              <label>Preferred time (best effort)</label>
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 6px" }}>
                This does <strong>not</strong> schedule delivery at your chosen hour — it only
                guarantees the report won&apos;t send <strong>before</strong> that hour. This system
                checks for due reports once daily, so most preferred hours will all result in the
                same actual delivery time. Leave as &quot;No preference&quot; for the plain schedule above.
              </p>
              {checkHour != null && (
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 8px" }}>
                  This system&apos;s daily check runs once, at approximately <strong>{fmtHour12(checkHour)}</strong> in
                  the timezone selected below.
                </p>
              )}
              {hourIsAfterCheck && (
                <p style={{ fontSize: 11.5, color: "var(--red)", margin: "0 0 8px" }}>
                  Warning: this hour may be later than this system&apos;s daily check time — your report
                  may not send today, and will only send once the check catches up naturally over time.
                </p>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <select
                  className="range-select" style={{ flex: 1 }}
                  value={draft.timezone ?? ""}
                  onChange={(e) => {
                    const timezone = e.target.value || null;
                    setDraft({ ...draft, timezone, preferredHour: timezone ? draft.preferredHour ?? 9 : null });
                  }}
                >
                  {TIMEZONES.map((tz) => <option key={tz.id} value={tz.id}>{tz.label}</option>)}
                </select>
                <select
                  className="range-select" style={{ width: 110 }}
                  value={draft.preferredHour ?? 9}
                  disabled={!draft.timezone}
                  onChange={(e) => setDraft({ ...draft, preferredHour: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{fmtHour12(h)}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })()}

        {nameError && (
          <p style={{ fontSize: 12, color: "var(--red)", margin: "0 0 10px" }}>{nameError}</p>
        )}

        <div className="modal-actions">
          <button className="btn btn-sm" type="button" onClick={() => { setDraft(null); setNameError(null); }} disabled={saving}>Cancel</button>
          <button className="btn btn-sm btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : draft.id ? "Save changes" : "Create report"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Library ───────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Reports</div>
          <p className="page-sub">
            Build, schedule, and share branded reports per brand — no login required for viewers
          </p>
        </div>
        <button
          className="btn btn-primary" type="button"
          onClick={() => { setDraft(emptyDraft(activeWsId)); setRecipientDraft(""); setNameError(null); }}
        >
          + New report
        </button>
      </div>

      {loadError && (
        <div className="card" style={{ borderColor: "var(--red)", marginBottom: 16 }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13 }}>{loadError}</p>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={load} type="button">Retry</button>
        </div>
      )}

      {reports === null ? (
        <SkeletonCard />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Report</th><th>Brand</th><th>Type</th><th>Date range</th>
                <th>Status</th><th>Created</th><th />
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "28px 0", textAlign: "center", color: "var(--text-muted)" }}>
                    No reports yet — create one to share performance with your team or a client.
                  </td>
                </tr>
              ) : (
                reports.map((r) => {
                  const scheduled = r.frequency !== "none" && r.recipients.length > 0;
                  return (
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => openReport(r.id)}>
                      <td style={{ fontWeight: 600 }}>
                        {r.name}
                        {scheduled && (
                          <span className="pill pill-neutral" style={{ marginLeft: 8, fontSize: 10, padding: "2px 7px" }}>
                            {labelOf(FREQUENCIES, r.frequency)} · {r.recipients.length} recipient
                            {r.recipients.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td>{brandName(r.workspaceId)}</td>
                      <td>{labelOf(TYPES, r.type)}</td>
                      <td>{labelOf(RANGES, r.dateRange)}</td>
                      <td><span className="pill pill-green" style={{ fontSize: 10.5 }}>{r.status}</span></td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.createdAt)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn btn-sm" type="button" onClick={(e) => { e.stopPropagation(); openReport(r.id); }}>
                          View →
                        </button>{" "}
                        <button className="btn btn-sm" type="button" onClick={(e) => { e.stopPropagation(); setDraft({ ...r }); setRecipientDraft(""); setNameError(null); }}>
                          Edit
                        </button>{" "}
                        <button className="btn btn-sm" type="button" onClick={(e) => { e.stopPropagation(); openCompare(r.id); }}>
                          Compare
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal}
    </div>
  );
}
