"use client";

import { useEffect, useRef, useState } from "react";

const ICONS = {
  doc: "M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.6H8V12Zm0 3.4h8V17H8v-1.6Z",
  users:
    "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-6 1.3-6 4v2h7v-2c0-1.1.4-2.1 1.2-2.9A9.6 9.6 0 0 0 8 14Zm8 0c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4Z",
  clock:
    "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11h-1a1 1 0 0 1-1-1V6a1 1 0 0 1 2 0v5h1a1 1 0 0 1 0 2Z",
  shield:
    "M12 2 3 7v6c0 5 3.8 8.4 9 9 5.2-.6 9-4 9-9V7l-9-5Zm-1 13-3-3 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z",
  gear: "M19.4 13a7.5 7.5 0 0 0 .1-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z",
};

const FEATURES = [
  {
    label: "Payroll",
    icon: ICONS.doc,
    desc: "Statutory PF, ESI, PT & TDS, challans and Form-16 — accurate every cycle.",
    g: "linear-gradient(150deg,#7c5cff,#5b8cff)",
  },
  {
    label: "Recruitment",
    icon: ICONS.users,
    desc: "AI résumé parsing, drag-and-drop pipelines, interviews and offers.",
    g: "linear-gradient(150deg,#2bd9c9,#5b8cff)",
  },
  {
    label: "Time & Attendance",
    icon: ICONS.clock,
    desc: "Web check-in, shift rosters and project timesheets — zero spreadsheets.",
    g: "linear-gradient(150deg,#5b8cff,#2bd9c9)",
  },
  {
    label: "Performance",
    icon: ICONS.shield,
    desc: "OKRs, appraisal cycles and continuous feedback in one place.",
    g: "linear-gradient(150deg,#ff7eb6,#7c5cff)",
  },
  {
    label: "Automation",
    icon: ICONS.gear,
    desc: "No-code rules from triggers, conditions and actions, plus webhooks.",
    g: "linear-gradient(150deg,#7c5cff,#2bd9c9)",
  },
];

const N = FEATURES.length;
const ITEM = 64; // chip rail spacing (px)

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (min: number, max: number, v: number) => {
  const r = max - min;
  return ((((v - min) % r) + r) % r) + min;
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/**
 * Scroll-pinned module showcase: the section is taller than the viewport;
 * scrolling through it advances the active card. Chips on the left rail
 * scroll vertically in sync; clicking a chip scrolls the page to that
 * card's slice of the pinned section.
 */
export function FeatureShowcase() {
  const [step, setStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    let ticking = false;
    function update() {
      const rect = scrollEl!.getBoundingClientRect();
      const total = scrollEl!.offsetHeight - window.innerHeight;
      const p = clamp(-rect.top / (total || 1), 0, 1);
      setStep(clamp(Math.floor(p * N), 0, N - 1));
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function jump(i: number) {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      setStep(i);
      return;
    }
    const total = scrollEl.offsetHeight - window.innerHeight;
    const targetP = (i + 0.5) / N;
    window.scrollTo({ top: scrollEl.offsetTop + targetP * total, behavior: "smooth" });
  }

  function cardState(i: number) {
    let diff = i - step;
    if (diff > N / 2) diff -= N;
    if (diff < -N / 2) diff += N;
    return diff === 0 ? "active" : diff === -1 ? "prev" : diff === 1 ? "next" : "hidden";
  }

  return (
    <section id="features">
      <div className="fc-scroll" ref={scrollRef}>
        <div className="fc-sticky">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">A closer look</span>
              <h2>
                The modules doing the{" "}
                <span className="serif-italic gradient-text">heavy lifting</span>
              </h2>
              <p>Scroll through the modules that do the heavy lifting.</p>
            </div>

            <div className="fc">
              <div className="fc-rail">
                <span className="fc-fade fc-fade-top" aria-hidden="true" />
                <span className="fc-fade fc-fade-bottom" aria-hidden="true" />
                <div className="fc-chips">
                  {FEATURES.map((f, i) => {
                    const wd = wrap(-N / 2, N / 2, i - step);
                    return (
                      <button
                        key={f.label}
                        className={`fc-chip${i === step ? " active" : ""}`}
                        style={{
                          transform: `translateY(calc(-50% + ${wd * ITEM}px))`,
                          opacity: Math.max(0, 1 - Math.abs(wd) * 0.25),
                        }}
                        onClick={() => jump(i)}
                      >
                        <span className="fc-cico">
                          <Icon d={f.icon} />
                        </span>
                        <span>{f.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="fc-stage">
                <div className="fc-cards">
                  {FEATURES.map((f, i) => (
                    <div
                      key={f.label}
                      className={`fc-card fc-${cardState(i)}`}
                      style={{ "--g": f.g } as React.CSSProperties}
                    >
                      <div className="fc-card-ico">
                        <Icon d={f.icon} />
                      </div>
                      <div className="fc-live">
                        <i /> Live module
                      </div>
                      <div className="fc-cap">
                        <span className="fc-cap-tag">
                          {i + 1} • {f.label}
                        </span>
                        <p>{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
