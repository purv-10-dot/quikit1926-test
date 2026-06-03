import React from "react";

const sections = [
  {
    label: "Methodology",
    rows: [
      { label: "One-Page Strategic Plan (OPSP)",                    quikscale: "yes", align: "yes" },
      { label: "Quarterly Rocks",                                    quikscale: "yes", align: "yes" },
      { label: "KPI / Critical Number Tracking",                     quikscale: "yes", align: "yes" },
      { label: "Meeting Rhythm (daily → quarterly)",                 quikscale: "yes", align: "yes" },
      { label: "Who What When (WWW)",                                quikscale: "yes", align: "yes" },
      { label: "Rockefeller Habits Checklist",                       quikscale: "yes", align: "yes" },
      { label: "Functional & Process Accountability (FACe / PACe)",  quikscale: "yes", align: "yes" },
      { label: "Goal Cascade (company → individual)",                quikscale: "yes", align: "yes" },
      { label: "eNPS",                                               quikscale: "yes", align: "yes" },
    ],
  },
  {
    label: "Platform",
    rows: [
      { label: "SWT Analysis",            quikscale: "yes", align: "no" },
      { label: "cNPS (Customer NPS)",     quikscale: "yes", align: "no" },
      { label: "Multi-company coach view", quikscale: "yes", align: "partial" },
    ],
  },
  {
    label: "AI",
    rows: [
      { label: "Executive Summary Generator", quikscale: "yes", align: "no" },
      { label: "KPI Risk Alerts",             quikscale: "yes", align: "yes" },
      { label: "Weekly Meeting Prep",         quikscale: "yes", align: "partial" },
      { label: "Strategy Gap Analysis",       quikscale: "yes", align: "no" },
      { label: "1:1 Coaching Briefs",         quikscale: "yes", align: "no" },
    ],
  },
] as const;

function Mark({ state }: { state: "yes" | "no" | "partial" }) {
  if (state === "yes") {
    return (
      <span className="cmp-mark cmp-yes" aria-label="Yes">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "partial") {
    return (
      <span className="cmp-mark cmp-partial" aria-label="Partial">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 8h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="cmp-mark cmp-no" aria-label="No">
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function Comparison() {
  return (
    <section id="compare" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">QuikScale vs Align Today</span>
        <h2 className="section-title">
          <span className="serif">Same methodology.</span>{" "}
          <span className="serif-bold">A modern way to run it.</span>
        </h2>
      </header>

      <div className="cmp-wrap">
        <table className="cmp-table">
          <thead>
            <tr>
              <th className="cmp-th-feature">Feature</th>
              <th className="cmp-th-quikscale">
                <span className="cmp-brand">QuikScale</span>
              </th>
              <th className="cmp-th-align">
                <span className="cmp-brand cmp-brand-muted">Align Today</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <React.Fragment key={s.label}>
                <tr className="cmp-section-row"><td colSpan={3}>{s.label}</td></tr>
                {s.rows.map((r) => (
                  <tr key={r.label}>
                    <td className="cmp-td-feature">{r.label}</td>
                    <td className="cmp-td-mark"><Mark state={r.quikscale} /></td>
                    <td className="cmp-td-mark"><Mark state={r.align} /></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cmp-disclaimer">
        Comparison based on publicly available product information as of 2026. Align
        Today is a trademark of its respective owner.
      </p>
    </section>
  );
}
