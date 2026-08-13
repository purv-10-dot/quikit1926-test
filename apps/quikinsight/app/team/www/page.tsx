"use client";
import { useEffect, useState, useMemo } from "react";
import { getTeamWww, type TeamWwwItem } from "@/lib/api/team";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonGrid } from "@/components/ui/Skeleton";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  "completed":       { label: "Completed",      color: "#fff", bg: "#2563eb" },
  "in-progress":     { label: "In progress",    color: "#fff", bg: "#16a34a" },
  "blocked":         { label: "Blocked",         color: "#fff", bg: "#dc2626" },
  "not-yet-started": { label: "Not started",    color: "#fff", bg: "#6b7280" },
  "not-applicable":  { label: "N/A",             color: "#fff", bg: "#9ca3af" },
};

function statusCfg(s: string) {
  return STATUS_CONFIG[s] ?? { label: s, color: "#fff", bg: "#9ca3af" };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(item: TeamWwwItem) {
  return item.status !== "completed" && new Date(item.when) < new Date();
}

export default function TeamWwwPage() {
  const [items, setItems] = useState<TeamWwwItem[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    getTeamWww().then(setItems).catch(() => setError(true));
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((item) => {
      const matchS = statusFilter === "all" || item.status === statusFilter;
      const matchQ = !search || item.what.toLowerCase().includes(search.toLowerCase()) || item.who.toLowerCase().includes(search.toLowerCase());
      return matchS && matchQ;
    });
  }, [items, statusFilter, search]);

  return (
    <div>
      {error ? (
        <NotConnected icon="⚠️" title="Couldn't load WWW items" body="Something went wrong. Please refresh and try again." ctaHref="/team/www" ctaLabel="Retry" />
      ) : !items ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <NotConnected icon="📋" title="No WWW items found" body="WHO does WHAT by WHEN commitments created in QuikScale will appear here." />
      ) : (
        <>
          <div className="filter-row" style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              className="range-select"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 180 }}
            />
            <select className="range-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                <option key={v} value={v}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Who", "What", "When", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", background: "var(--bg-secondary)", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)", borderBottom: "1px solid var(--hairline)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const sc = statusCfg(item.status);
                  const overdue = isOverdue(item);
                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{item.who}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <p style={{ margin: 0, fontWeight: 500, color: "var(--ink)" }}>{item.what}</p>
                        {item.notes && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{item.notes}</p>}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ color: overdue ? "var(--red, #dc2626)" : "var(--text-secondary)", fontWeight: overdue ? 600 : 400 }}>
                          {formatDate(item.when)}
                        </span>
                        {overdue && <span style={{ fontSize: 11, marginLeft: 6, color: "var(--red, #dc2626)" }}>Overdue</span>}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, background: sc.bg, color: sc.color }}>{sc.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</p>
        </>
      )}
    </div>
  );
}
