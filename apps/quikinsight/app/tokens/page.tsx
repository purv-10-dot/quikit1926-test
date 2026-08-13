"use client";

import { useEffect, useState } from "react";

interface TokenBalance {
  totalTokens: number;
  usedTokens: number;
  remainingTokens: number;
}

interface UsageLogRow {
  id: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  status: string;
  createdAt: string;
}

const PLACEHOLDER_CARDS = [
  { title: "Buy Tokens", icon: "🪙", description: "Purchase additional token packs for your workspace." },
  { title: "Top Up", icon: "⚡", description: "Instantly replenish your balance with a one-time top-up." },
  { title: "Upgrade Plan", icon: "🚀", description: "Move to a higher tier for a larger monthly allocation." },
  { title: "Billing", icon: "💳", description: "Manage payment methods and view invoices." },
  { title: "Usage Analytics", icon: "📊", description: "Deep-dive breakdowns by feature, model, and time period." },
  { title: "Current Plan", icon: "📋", description: "View the details of your active subscription plan." },
  { title: "Monthly Allocation", icon: "🗓️", description: "See how many tokens are included each month." },
  { title: "Renewal Date", icon: "🔄", description: "Next billing and token-refresh date for your account." },
];

const STATUS_CLASS: Record<string, string> = {
  success: "color: var(--success)",
  error: "color: var(--danger)",
  limit_exceeded: "color: var(--warning)",
};

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function TokensPage() {
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [history, setHistory] = useState<UsageLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const LIMIT = 20;

  useEffect(() => {
    fetch("/api/tokens/balance")
      .then((r) => r.json())
      .then(setBalance)
      .catch(() => null);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/tokens/history?page=${page}&limit=${LIMIT}`)
      .then((r) => r.json())
      .then((d) => { setHistory(d.rows ?? []); setTotal(d.total ?? 0); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [page]);

  const usedPct = balance ? Math.min(100, (balance.usedTokens / balance.totalTokens) * 100) : 0;
  const usedPctDisplay = usedPct < 0.1 && usedPct > 0 ? "<0.1" : usedPct.toFixed(1);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Token Management</h1>
        <p style={{ color: "var(--text-secondary)", margin: "4px 0 0", fontSize: 14 }}>
          AI tokens are consumed when generating insights. Your balance resets monthly.
        </p>
      </div>

      {/* ── Balance card ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 48, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>Total Tokens</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              {balance ? fmt(balance.totalTokens) : "—"}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>Used</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              {balance ? fmt(balance.usedTokens) : "—"}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px" }}>Remaining</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)", margin: 0 }}>
              {balance ? fmt(balance.remainingTokens) : "—"}
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 6px" }}>Usage ({usedPctDisplay}%)</p>
            <div style={{ background: "var(--border)", borderRadius: 8, height: 10, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `max(${usedPct}%, ${balance?.usedTokens ? "3px" : "0px"})`,
                  background: usedPct > 80 ? "var(--danger)" : usedPct > 50 ? "var(--warning)" : "var(--accent)",
                  borderRadius: 8,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Coming-soon feature cards ── */}
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 14px" }}>
        Features &amp; Plans
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 32,
        }}
      >
        {PLACEHOLDER_CARDS.map((c) => (
          <div
            key={c.title}
            className="card"
            style={{ position: "relative", cursor: "default", opacity: 0.85 }}
          >
            <span
              style={{
                position: "absolute",
                top: 10,
                right: 12,
                fontSize: 11,
                fontWeight: 600,
                background: "var(--accent-light, #ede9fe)",
                color: "var(--accent)",
                borderRadius: 20,
                padding: "2px 8px",
              }}
            >
              Coming soon
            </span>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
            <p style={{ fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>{c.title}</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.45 }}>
              {c.description}
            </p>
          </div>
        ))}
      </div>

      {/* ── Usage history table ── */}
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 14px" }}>
        Usage History
      </h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: 20, color: "var(--text-secondary)", textAlign: "center" }}>Loading…</p>
        ) : history.length === 0 ? (
          <p style={{ padding: 20, color: "var(--text-secondary)", textAlign: "center" }}>
            No usage recorded yet. AI insights will appear here once generated.
          </p>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-alt, var(--surface))", borderBottom: "1px solid var(--border)" }}>
                  {["Feature", "Model", "Input", "Output", "Total", "Status", "Time"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 14px",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "9px 14px", color: "var(--text-primary)", textTransform: "capitalize" }}>{row.feature}</td>
                    <td style={{ padding: "9px 14px", color: "var(--text-secondary)", fontSize: 12, fontFamily: "monospace" }}>{row.model}</td>
                    <td style={{ padding: "9px 14px", color: "var(--text-primary)", textAlign: "right" }}>{fmt(row.inputTokens)}</td>
                    <td style={{ padding: "9px 14px", color: "var(--text-primary)", textAlign: "right" }}>{fmt(row.outputTokens)}</td>
                    <td style={{ padding: "9px 14px", fontWeight: 600, color: "var(--text-primary)", textAlign: "right" }}>{fmt(row.totalTokens)}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background:
                            row.status === "success"
                              ? "var(--success-bg, #dcfce7)"
                              : row.status === "limit_exceeded"
                              ? "var(--warning-bg, #fef9c3)"
                              : "var(--danger-bg, #fee2e2)",
                          color:
                            row.status === "success"
                              ? "var(--success, #16a34a)"
                              : row.status === "limit_exceeded"
                              ? "var(--warning, #ca8a04)"
                              : "var(--danger, #dc2626)",
                        }}
                      >
                        {row.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{fmtDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* pagination */}
            {total > LIMIT && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    opacity: page === 1 ? 0.45 : 1,
                  }}
                >
                  Previous
                </button>
                <span style={{ lineHeight: "30px", fontSize: 13, color: "var(--text-secondary)" }}>
                  Page {page} of {Math.ceil(total / LIMIT)}
                </span>
                <button
                  disabled={page >= Math.ceil(total / LIMIT)}
                  onClick={() => setPage((p) => p + 1)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    cursor: page >= Math.ceil(total / LIMIT) ? "not-allowed" : "pointer",
                    opacity: page >= Math.ceil(total / LIMIT) ? 0.45 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
