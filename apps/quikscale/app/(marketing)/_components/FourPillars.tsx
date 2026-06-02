"use client";

import { useEffect, useRef } from "react";

const pillars = [
  {
    key: "people",
    name: "People",
    quote: "The right people, in the right seats, doing the right things.",
    body:
      "Build a team and culture that can carry the weight of growth. Track accountability rhythms, ownership, and talent density — so the company never depends on a single leader.",
    inProduct: "Owners on every Rock, KPI, and Critical Number.",
  },
  {
    key: "strategy",
    name: "Strategy",
    quote: "A clear, differentiated strategy that everyone understands.",
    body:
      "One page. BHAG, core values, annual priorities, quarterly Rocks. A living strategic plan the whole company can recite — not a 50-page document that lives in a drive.",
    inProduct: "One-Page Strategic Plan (OPSP), live and editable.",
  },
  {
    key: "execution",
    name: "Execution",
    quote: "Discipline and consistency in how the work gets done.",
    body:
      "Daily huddles, weekly teams, monthly leadership, quarterly planning. The rhythm that surfaces problems fast and resolves them faster — operationalized inside the tool.",
    inProduct: "Meeting Rhythm engine with red / yellow / green flags.",
  },
  {
    key: "cash",
    name: "Cash",
    quote: "Understanding the cash flow that fuels growth.",
    body:
      "Profitable companies still run out of cash and die. Full visibility into the financial levers — cash conversion cycle, runway, burn — alongside the operational picture.",
    inProduct: "Cash conversion cycle and financial KPIs on the same scorecard.",
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
          <span className="section-eyebrow">The Four Pillars</span>
          <h2 className="section-title">
            <span className="serif">The soul of Scaling Up,</span>{" "}
            <span className="serif-bold">in four colors.</span>
          </h2>
          <p className="section-lede">
            Every feature, every screen, every metric in QuikScale maps back to one of the
            four pillars. Scroll to reveal each one.
          </p>
        </header>

        <div className="pillars-row-wrap">
          <div className="pillars-row" ref={rowRef}>
            {pillars.map((p) => (
              <article key={p.key} className={`pillar-card pillar-${p.key}`}>
                <div className="pillar-card-head">
                  <h3 className="pillar-name serif-bold">{p.name}</h3>
                </div>
                <p className="pillar-quote">&ldquo;{p.quote}&rdquo;</p>
                <p className="pillar-body">{p.body}</p>
                <p className="pillar-inproduct">
                  <span className="pillar-inproduct-label">In QuikScale</span>
                  <span>{p.inProduct}</span>
                </p>
              </article>
            ))}
            <span className="pillars-row-spacer" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}
