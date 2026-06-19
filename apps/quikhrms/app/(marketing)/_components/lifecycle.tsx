"use client";

import { useEffect, useRef } from "react";

const STAGES = [
  { n: "01", title: "Hire", desc: "ATS, AI matching & offers" },
  { n: "02", title: "Onboard", desc: "Guided checklists & e-sign" },
  { n: "03", title: "Pay", desc: "Compliant India payroll" },
  { n: "04", title: "Manage", desc: "Time, leave & expenses" },
  { n: "05", title: "Engage", desc: "Recognition & surveys" },
  { n: "06", title: "Grow", desc: "OKRs, reviews & PIPs" },
];

/** Six-stage timeline whose connecting line fills in when scrolled into view. */
export function Lifecycle() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const timeline = timelineRef.current;
    const fill = fillRef.current;
    if (!timeline) return;

    function activate() {
      timeline!.classList.add("in");
      if (fill) fill.style.width = "88%";
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      activate();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            activate();
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(timeline);
    return () => io.disconnect();
  }, []);

  return (
    <section className="section" id="lifecycle">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">The whole journey</span>
          <h2>
            One platform for the <span className="serif-italic gradient-text">entire</span>{" "}
            lifecycle
          </h2>
          <p>
            Hire, onboard, pay, manage, engage and grow — every stage connected, every handoff
            automatic.
          </p>
        </div>
        <div className="timeline reveal" ref={timelineRef}>
          <span className="line-fill" ref={fillRef} />
          {STAGES.map((s) => (
            <div className="tnode" key={s.n}>
              <div className="tdot">{s.n}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
