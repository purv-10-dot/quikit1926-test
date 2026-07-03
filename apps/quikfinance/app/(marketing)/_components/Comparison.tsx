type Cell = "yes" | "no" | "partial";

const columns = ["QuikTrack", "Jira Standard", "Linear", "ClickUp", "Plane"] as const;

const rows: { label: string; marks: Cell[] }[] = [
  { label: "Sprint boards (Scrum + Kanban)", marks: ["yes", "yes", "yes", "yes", "yes"] },
  { label: "Backlog management", marks: ["yes", "yes", "yes", "yes", "yes"] },
  { label: "Bug & issue tracking", marks: ["yes", "yes", "yes", "yes", "yes"] },
  { label: "Custom workflows", marks: ["yes", "yes", "partial", "yes", "yes"] },
  { label: "Release management", marks: ["yes", "yes", "yes", "yes", "partial"] },
  { label: "Velocity reporting", marks: ["yes", "yes", "yes", "yes", "partial"] },
  { label: "INR pricing", marks: ["yes", "no", "no", "no", "no"] },
  { label: "No marketplace add-ons needed", marks: ["yes", "no", "yes", "yes", "yes"] },
  { label: "Managed cloud (no self-hosting)", marks: ["yes", "yes", "yes", "yes", "no"] },
  { label: "Built for Indian teams", marks: ["yes", "no", "no", "no", "no"] },
];


function Mark({ state }: { state: Cell }) {
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
      <span className="cmp-mark cmp-partial" aria-label="Limited">
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
        <span className="section-eyebrow">Comparison</span>
        <h2 className="section-title">
          <span className="serif-bold">See how QuikTrack stacks up against others.</span>
        </h2>
        <p className="section-lede">
          Every capability your engineering team needs — sprint boards, backlog, bug
          tracking, custom workflows, and releases — compared across the tools your
          team is evaluating.
        </p>
      </header>

      <div className="cmp-wrap">
        <table className="cmp-table" aria-label="QuikTrack vs Jira comparison">
          <thead>
            <tr>
              <th className="cmp-th-feature">Feature</th>
              {columns.map((c, i) => (
                <th key={c} className="cmp-th-product">
                  <span className={`cmp-brand${i === 0 ? "" : " cmp-brand-muted"}`}>{c}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="cmp-td-feature">{r.label}</td>
                {r.marks.map((m, i) => (
                  <td key={i} className="cmp-td-mark"><Mark state={m} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cmp-callout">Every feature your team needs. Zero add-ons required.</p>

    </section>
  );
}
