"use client";
import { useEffect, useState } from "react";

type View = "daily" | "weekly" | "monthly";

interface TimesheetRow {
  date?: string;
  week?: string;
  month?: string;
  user: string;
  avatar: string;
  project: string;
  task?: string;
  hours: number;
  description?: string;
  dummy: boolean;
}

interface ApiResponse {
  view: View;
  rows: TimesheetRow[];
  source: "live" | "dummy";
}

function totalHours(rows: TimesheetRow[]) {
  return rows.reduce((s, r) => s + r.hours, 0);
}

function groupBy<T>(arr: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(item);
  }
  return m;
}

export default function QuikProjectPage() {
  const [view, setView]       = useState<View>("weekly");
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/team/quikproject?view=${view}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [view]);

  const rows    = data?.rows ?? [];
  const isDummy = data?.source === "dummy";

  // Group rows by the time-period label for the current view
  const periodKey = (r: TimesheetRow) =>
    view === "daily"   ? (r.date ?? "")  :
    view === "weekly"  ? (r.week ?? "")  :
                         (r.month ?? "");

  const grouped = groupBy(rows, periodKey);
  const periods = [...grouped.keys()];

  const totalAll = totalHours(rows);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      {/* ── header ── */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>QuikProject</h1>
          <p style={{ color: "var(--text-secondary)", margin: "4px 0 0", fontSize: 14 }}>
            Team timesheet — daily, weekly &amp; monthly view
            {/* One stamp vocabulary across the app: "Mock", never "dummy data"
                or "(sample data)". Mixing labels made a single card look like
                it carried two different warnings. */}
            {isDummy && <span className="mock-badge mock-badge-inline" aria-label="Mock data">Mock</span>}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "var(--bg-secondary)", borderRadius: 8, padding: 3 }}>
          {(["daily", "weekly", "monthly"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                background: view === v ? "var(--bg-primary)" : "transparent",
                color: view === v ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: view === v ? "0 1px 4px rgba(0,0,0,.08)" : "none",
                transition: "all .15s",
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── summary strip ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Hours", value: totalAll.toFixed(1) },
          { label: "Team Members", value: new Set(rows.map((r) => r.user)).size },
          { label: "Projects", value: new Set(rows.map((r) => r.project)).size },
          { label: "Avg / Member", value: rows.length ? (totalAll / new Set(rows.map((r) => r.user)).size).toFixed(1) : "—" },
        ].map((s) => (
          <div
            key={s.label}
            className="card"
            style={{ flex: "1 1 160px", minWidth: 140, padding: "14px 18px" }}
          >
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 4px" }}>{s.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{String(s.value)}</p>
          </div>
        ))}
      </div>

      {/* ── table ── */}
      {loading ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
      ) : periods.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No timesheet data found.</div>
      ) : (
        periods.map((period) => {
          const periodRows = grouped.get(period)!;
          return (
            <div key={period} className="card" style={{ marginBottom: 16, overflow: "hidden", padding: 0 }}>
              <div style={{
                padding: "10px 16px",
                background: "var(--bg-secondary)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>{period}</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{totalHours(periodRows).toFixed(1)} hrs total</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)" }}>
                    {["Member", "Project", "Task", "Hours", "Description"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "var(--text-secondary)", fontWeight: 500, fontSize: 12, borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 14px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: "var(--accent-100,#e0e7ff)",
                            color: "var(--accent-700,#4338ca)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700, flexShrink: 0,
                          }}>
                            {r.avatar}
                          </div>
                          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.user}</span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 14px", color: "var(--text-secondary)" }}>{r.project}</td>
                      <td style={{ padding: "8px 14px", color: "var(--text-secondary)" }}>{r.task ?? "—"}</td>
                      <td style={{ padding: "8px 14px", fontWeight: 600, color: "var(--text-primary)" }}>{r.hours.toFixed(1)}</td>
                      <td style={{ padding: "8px 14px", color: "var(--text-muted)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}
