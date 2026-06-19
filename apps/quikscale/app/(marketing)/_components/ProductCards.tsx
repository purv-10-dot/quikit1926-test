type Module = {
  title: string;
  desc: string;
  accent: string;
  icon: string;
};

const MODULES: Module[] = [
  { title: "KPI Tracking", desc: "R/Y/G health on every critical number.", accent: "blue", icon: "KPI Tracking.png" },
  { title: "Priorities", desc: "Quarterly Rocks tracked week-by-week.", accent: "orange", icon: "Priorities.png" },
  { title: "WWW", desc: "Who does What by When — from every meeting.", accent: "sand", icon: "WWW.png" },
  { title: "Meeting Rhythm", desc: "Daily huddles to quarterly planning.", accent: "sage", icon: "Meeting Rhythm.png" },
  { title: "OPSP", desc: "One-Page Strategic Plan, versioned quarter on quarter.", accent: "purple", icon: "OPSP.png" },
  { title: "Habits", desc: "Rockefeller Habits checklist, live weekly.", accent: "olive", icon: "Habits.png" },
  { title: "SWT", desc: "Strengths, Weaknesses & Trends mapped to your plan.", accent: "grey", icon: "SWT.png" },
  { title: "Goals & Pillars", desc: "Company → department → individual cascade.", accent: "mauve", icon: "goals-pillars.png" },
  { title: "FACe", desc: "Functional Accountability Chart — every seat, every owner.", accent: "grey", icon: "FACe.png" },
  { title: "PACe", desc: "Process Accountability Chart — owners and outputs.", accent: "sand", icon: "PACe.png" },
  { title: "Surveys", desc: "Employee & customer Net Promoter Score, tracked quarterly.", accent: "sky", icon: "enps-cnps.png" },
  { title: "Cash", desc: "Power of One — model how 1% compounds into cash.", accent: "amber", icon: "Cash.png" },
];

export default function ProductCards() {
  return (
    <section className="pc-section surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">The Full Toolkit</span>
        <h2 className="section-title">
          <span className="serif">Every Scaling tool,</span>{" "}
          <span className="serif-bold">built in.</span>
        </h2>
        <p className="section-lede">
          Twelve modules. One platform. No switching between spreadsheets, PDFs, and separate tools.
        </p>
      </header>

      <div className="pc-grid">
        {MODULES.map((m) => (
          <article
            key={m.title}
            className={`pc-card${m.accent ? ` pc-accent-${m.accent}` : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="pc-icon"
              src={`/${encodeURIComponent(m.icon)}`}
              alt=""
              aria-hidden="true"
            />
            <h3 className="pc-title serif-bold">{m.title}</h3>
            <p className="pc-desc">{m.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
