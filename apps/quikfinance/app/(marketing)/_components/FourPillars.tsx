"use client";

import { useEffect, useRef } from "react";

const pillars = [
  {
    key: "people",
    name: "Sprint Boards",
    quote: "Your process, visible from kickoff to done.",
    body:
      "Full Scrum and Kanban support — sprint planning, velocity, and burndown in one place. Run two-week sprints or continuous Kanban flow with WIP limits and real-time progress.",
    inProduct: "Scrum + Kanban boards, sprint planning, velocity reports.",
  },
  {
    key: "strategy",
    name: "Backlog Management",
    quote: "Product and engineering, one source of truth.",
    body:
      "Same priorities, no offline spreadsheets, no misaligned expectations. Drag stories into a sprint, split epics, set story points — in seconds, not clicks.",
    inProduct: "Drag-to-prioritize backlog with story points and estimates.",
  },
  {
    key: "execution",
    name: "Bug & Issue Tracking",
    quote: "Every issue owned. Every resolution tracked.",
    body:
      "Every bug has an owner and a status. Capture issues with full hierarchy — epics, stories, tasks, bugs — link commits, attach screenshots, @-mention teammates.",
    inProduct: "Epics → stories → tasks, with Git, screenshots, and comments.",
  },
  {
    key: "cash",
    name: "Custom Workflows",
    quote: "Your process, built exactly how you work.",
    body:
      "Build the workflow your team actually uses. Custom statuses, transitions, validators, and approvals — designed around your engineering process, not a rigid default.",
    inProduct: "Custom statuses, transitions, releases — no paid plugins.",
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
          <span className="section-eyebrow">Built for how engineering teams actually work.</span>
          <h2 className="section-title">
            <span className="serif">Powerful project management</span>{" "}
            <span className="serif-bold">for teams that move fast.</span>
          </h2>
          <p className="section-lede">
            Sprint boards, backlogs, issue tracking, and custom workflows — everything
            your engineering team needs, connected in a single workspace designed for
            speed and clarity.
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
                  <span className="pillar-inproduct-label">In QuikTrack</span>
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
