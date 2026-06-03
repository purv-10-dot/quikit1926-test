"use client";

import { useEffect, useRef } from "react";

const pillars = [
  {
    key: "people",
    name: "People",
    subtitle: "HAPPINESS & ACCOUNTABILITY",
    quote: "The right people, in the right seats, doing the right things.",
    body:
      "Build the team that can carry the weight of growth. Track accountability, ownership, and talent density — so performance is visible, every seat is owned, and the company never depends on a single leader.",
    inProduct: "Goals, 1:1s, FACe & PACe charts, talent reviews, and NPS — all connected.",
  },
  {
    key: "strategy",
    name: "Strategy",
    subtitle: "REVENUE & GROWTH",
    quote: "A clear, differentiated plan everyone understands — and can recite.",
    body:
      "One page. BHAG, core values, 3–5 year targets, quarterly Rocks, and the Rockefeller Habits checklist. A living OPSP the whole company can see — not a 50-page document that lives in a drive.",
    inProduct: "OPSP live and editable. Versioned quarter on quarter.",
  },
  {
    key: "execution",
    name: "Execution",
    subtitle: "PROFIT & TIME",
    quote: "Discipline and consistency in how the work gets done.",
    body:
      "KPI tracking with red/amber/green health, weekly Rock progress, and WWW action items from every meeting. A slipping Rock surfaces in week 3 — not at the quarter-end retrospective.",
    inProduct: "Meeting Rhythm engine with R/Y/G flags. KPIs. Rocks. WWW.",
  },
  {
    key: "cash",
    name: "Cash",
    subtitle: "OXYGEN & OPTIONS",
    quote: "Profitable companies still run out of cash and die.",
    body:
      "The Power of One — model how a 1% change in price, volume, COGS, overheads, or debtor days compounds into cash and EBIT. Your finance team stops guessing about the levers.",
    inProduct: "Cash conversion cycle and Power of One on the same scorecard.",
  },
] as const;

export default function FourPillars() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const row = rowRef.current;
    if (!section || !row) return;

    let target = 0;
    let current = 0;
    let rafId = 0;
    let running = false;

    const computeTarget = () => {
      const rect = section.getBoundingClientRect();
      const distance = section.offsetHeight - window.innerHeight;
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(distance, 1)));
      const maxX = row.scrollWidth - row.clientWidth;
      target = -progress * maxX;
    };

    const tick = () => {
      const delta = target - current;
      // Lerp towards the target — higher factor = snappier, lower = smoother
      current += delta * 0.12;
      if (Math.abs(delta) < 0.5) {
        current = target;
        row.style.transform = `translate3d(${current}px, 0, 0)`;
        running = false;
        return;
      }
      row.style.transform = `translate3d(${current}px, 0, 0)`;
      rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      computeTarget();
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    };

    computeTarget();
    current = target;
    row.style.transform = `translate3d(${current}px, 0, 0)`;

    window.addEventListener("scroll", start, { passive: true });
    window.addEventListener("resize", start);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", start);
      window.removeEventListener("resize", start);
    };
  }, []);

  return (
    <section
      id="pillars"
      ref={sectionRef}
      className="surface-card section-card pillars-hscroll"
    >
      <div className="pillars-hscroll-pin">
        <header className="section-header pillars-hscroll-header">
          <span className="section-eyebrow">The Four Decisions</span>
          <h2 className="section-title">
            <span className="serif">Most tools track one thing.</span>{" "}
            <span className="serif-bold">Your business isn&apos;t one thing.</span>
          </h2>
          <p className="section-lede">A single platform that sees your business the way you do — as one interconnected system.</p>
        </header>

        <div className="pillars-row-wrap">
          <div className="pillars-row" ref={rowRef}>
            {pillars.map((p) => (
              <article key={p.key} className={`pillar-card pillar-${p.key}`}>
                <div className="pillar-card-head">
                  <h3 className="pillar-name serif-bold">{p.name}</h3>
                  <span className="pillar-subtitle">{p.subtitle}</span>
                </div>
                <p className="pillar-quote">&ldquo;{p.quote}&rdquo;</p>
                <p className="pillar-body">{p.body}</p>
              </article>
            ))}
            <span className="pillars-row-spacer" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}
