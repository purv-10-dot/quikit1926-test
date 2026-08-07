"use client";
import { useState } from "react";
import type { Lead } from "@/types";

type SortKey = keyof Lead;

const statusClass: Record<Lead["status"], string> = {
  New: "lead-status-new",
  Contacted: "lead-status-contacted",
  Qualified: "lead-status-qualified",
  Customer: "lead-status-customer",
};

export default function LeadsTable({ leads }: { leads: Lead[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);

  function sortBy(key: SortKey) {
    setDir((d) => (sortKey === key ? ((d * -1) as 1 | -1) : 1));
    setSortKey(key);
  }

  let rows = leads;
  if (sortKey) {
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>Recent leads</h3>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>click a column to sort</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => sortBy("name")}>Name</th>
              <th onClick={() => sortBy("company")}>Company</th>
              <th onClick={() => sortBy("source")}>Source</th>
              <th onClick={() => sortBy("status")}>Status</th>
              <th onClick={() => sortBy("score")}>Score</th>
              <th onClick={() => sortBy("owner")}>Owner</th>
              <th onClick={() => sortBy("createdAt")}>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td>{l.company}</td>
                <td>{l.source}</td>
                <td><span className={`lead-status-pill ${statusClass[l.status]}`}>{l.status}</span></td>
                <td>
                  <span className="lead-score-track"><span className="lead-score-fill" style={{ width: `${l.score}%` }} /></span>
                  {l.score}
                </td>
                <td>{l.owner}</td>
                <td>{new Date(l.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
