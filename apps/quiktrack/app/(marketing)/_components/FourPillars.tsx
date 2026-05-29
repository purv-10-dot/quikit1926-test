"use client";

import { useEffect, useRef } from "react";

const pillars = [
  {
    key: "people",
    name: "Sprint Boards",
    quote: "Your team's process stays the same. Your invoice doesn't.",
    body:
      "Full Scrum and Kanban support — sprint planning, velocity, and burndown in one place. Run two-week sprints or continuous Kanban flow, without the Jira lag.",
    inProduct: "Scrum + Kanban boards, sprint planning, velocity reports.",
  },
  {
    key: "strategy",
    name: "Backlog Management",
    quote: "Product and engineering, one backlog.",
    body:
      "Same priorities, no offline spreadsheets, no “that’s not what we agreed” moments. Drag stories into a sprint, split epics, set story points — in seconds, not clicks.",
    inProduct: "Drag-to-prioritize backlog with story points and estimates.",
  },
  {
    key: "execution",
    name: "Bug & Issue Tracking",
    quote: "Nothing buried in Slack. Nothing quietly dropped.",
    body:
      "Every bug has an owner and a status. Capture issues with full hierarchy — epics, stories, tasks, bugs — link commits, attach screenshots, @-mention teammates.",
    inProduct: "Epics → stories → tasks, with Git, screenshots, and comments.",
  },
  {
    key: "cash",
    name: "Custom Workflows",
    quote: "Your process. Not Atlassian's idea of your process.",
    body:
      "Build the workflow your team actually uses — not the one Jira assumed you’d need in 2003. Custom statuses, transitions, validators, and approvals, no Marketplace add-on required.",
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
          <span className="section-eyebrow">Full Jira functionality. 1/10th the cost.</span>
          <h2 className="section-title">
            <span className="serif">Affordable project management software</span>{" "}
            <span className="serif-bold">for Indian engineering teams.</span>
          </h2>
          <p className="section-lede">
            QuikTrack gives your dev team the features they actually use — sprints,
            backlogs, bug tracking, and custom workflows — at approximately ₹66/user/month.
            No marketplace dependencies. No USD pricing surprises.
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
