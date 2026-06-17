"use client";

import { useState } from "react";
import { Counter } from "./counter";

/** Mouse-follow spotlight: feeds the card's ::before radial-gradient vars. */
function spotlight(e: React.PointerEvent<HTMLElement>) {
  const card = e.currentTarget;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--mx", e.clientX - r.left + "px");
  card.style.setProperty("--my", e.clientY - r.top + "px");
}

const CHART_BARS = ["48%", "70%", "58%", "86%", "74%", "96%", "65%"];

export function ModulesBento() {
  const [checkinOn, setCheckinOn] = useState(true);

  return (
    <section className="section" id="modules">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Module overview</span>
          <h2>
            Everything HR, <span className="serif-italic gradient-text">beautifully</span>{" "}
            connected
          </h2>
          <p>
            Thirteen deeply integrated modules sharing one source of truth — so data flows,
            approvals route, and nothing falls through the cracks.
          </p>
        </div>

        <div className="bento" id="bento">
          {/* FEATURE: Core Workspace with live KPIs + toggle footer */}
          <article
            className="card bx bx-feat reveal"
            style={{ "--acc": "#7c5cff" } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="c-ico">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <h3>Core Workspace</h3>
            <p>
              A role-aware home — personalised dashboards, approvals &amp; one-tap check-in for
              every employee, manager and admin.
            </p>
            <div className="cv-kpis">
              <div className="cv-kpi">
                <small>Headcount</small>
                <Counter as="b" value={1284} />
              </div>
              <div className="cv-kpi">
                <small>Present</small>
                <Counter as="b" value={92} suffix="%" />
              </div>
              <div className="cv-kpi">
                <small>Approvals</small>
                <Counter as="b" value={23} />
              </div>
            </div>
            <div className="cv-chart" aria-hidden="true">
              {CHART_BARS.map((h, i) => (
                <span key={i} style={{ height: h }} />
              ))}
            </div>
            <div className="bx-foot">
              <span className="bx-pill">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11h-1a1 1 0 0 1-1-1V6a1 1 0 0 1 2 0v5h1a1 1 0 0 1 0 2Z"
                    fill="currentColor"
                  />
                </svg>{" "}
                Web check-in
              </span>
              <button
                className={`bx-toggle${checkinOn ? " on" : ""}`}
                onClick={() => setCheckinOn((v) => !v)}
                aria-label="Toggle check-in"
              >
                <i />
              </button>
            </div>
          </article>

          {/* INTEGRATIONS / modules connected */}
          <article
            className="card bx bx-track reveal"
            data-d="1"
            style={{ "--acc": "#5b8cff" } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="bx-row">
              <div>
                <h4>All modules connected</h4>
                <small>One source of truth across HR</small>
              </div>
              <div className="bx-chips">
                <span className="bx-chip" style={{ "--c": "#7c5cff" } as React.CSSProperties}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-6 1.3-6 4v2h7v-2c0-1.1.4-2.1 1.2-2.9A9.6 9.6 0 0 0 8 14Zm8 0c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span className="bx-chip" style={{ "--c": "#2bd9c9" } as React.CSSProperties}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11h-1a1 1 0 0 1-1-1V6a1 1 0 0 1 2 0v5h1a1 1 0 0 1 0 2Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span
                  className="bx-chip"
                  style={{ "--c": "#ff7eb6", fontWeight: 800 } as React.CSSProperties}
                >
                  ₹
                </span>
                <span className="bx-chip bx-chip-more">+10</span>
              </div>
            </div>
          </article>

          {/* LIVE STAT */}
          <article
            className="card bx bx-stat reveal"
            data-d="2"
            style={{ "--acc": "#2bd9c9" } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="bx-stat-top">
              <h4>Attendance</h4>
              <span className="bx-live">● Live</span>
            </div>
            <small>Present across the org today</small>
            <Counter className="bx-big gradient-text" value={92} suffix="%" />
            <div className="bx-bar" aria-hidden="true">
              <i style={{ "--w": "92%" } as React.CSSProperties} />
            </div>
            <small className="bx-stat-sub">1,180 of 1,284 employees checked in</small>
          </article>

          {/* HERO NUMBER */}
          <article
            className="card bx bx-hero reveal"
            data-d="1"
            style={{ "--acc": "#7c5cff" } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <Counter className="bx-huge gradient-text" value={13} />
            <div className="bx-dots" aria-hidden="true">
              {Array.from({ length: 13 }, (_, i) => (
                <span key={i} />
              ))}
            </div>
            <h3>One unified suite</h3>
            <p>
              Hire, onboard, pay, manage, engage and grow — every module on a single secure,
              multi-tenant platform.
            </p>
          </article>

          {/* SHORTCUT / command palette */}
          <article
            className="card bx bx-short reveal"
            data-d="2"
            style={{ "--acc": "#ff7eb6" } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="bx-short-l">
              <span className="c-ico sm">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M10 4a6 6 0 1 0 3.8 10.6l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <div>
                <h4>Jump to anything</h4>
                <small>Search people, payslips &amp; actions instantly</small>
              </div>
            </div>
            <div className="bx-kbd">
              <kbd>⌘</kbd>
              <span>+</span>
              <kbd>K</kbd>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
