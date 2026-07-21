"use client";

import { useEffect, useRef, useState } from "react";

const ROTATING_WORDS = ["workforce", "payroll", "hiring", "attendance", "people ops"];

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Mini June-2026 calendar inside the dashboard mockup (static content). */
function MiniCalendar() {
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="dh-cal-grid">
      {weekdays.map((d, i) => (
        <span key={`wd-${i}`} className="dc-wd">
          {d}
        </span>
      ))}
      {/* June 1, 2026 is a Monday → one blank under Sunday */}
      <span />
      {Array.from({ length: 30 }, (_, i) => {
        const d = i + 1;
        const cls = d === 9 ? "dc-day today" : d === 5 || d === 14 ? "dc-day holiday" : "dc-day";
        return (
          <span key={d} className={cls}>
            {d}
          </span>
        );
      })}
    </div>
  );
}

/** "Hours worked" ticker in the mockup — counts up from 0h 40m 07s. */
function AttendanceTimer() {
  const [t, setT] = useState({ h: 0, m: 40, s: 7 });
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => {
      setT((prev) => {
        let { h, m, s } = prev;
        s++;
        if (s >= 60) {
          s = 0;
          m++;
        }
        if (m >= 60) {
          m = 0;
          h++;
        }
        return { h, m, s };
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="dh-time">
      <b>{t.h}</b>h <span className="dh-m">{t.m}</span>m{" "}
      <span className="dh-s">{String(t.s).padStart(2, "0")}</span>s
    </div>
  );
}

/**
 * Hero: headline with kinetic rotating word, social proof, and a live
 * dashboard mockup. On desktop, clones of three mockup panels float beside
 * the headline and fly down to dock into the dashboard as you scroll.
 */
export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const dashRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef<HTMLSpanElement>(null);

  // Kinetic rotating headline word.
  useEffect(() => {
    const rot = rotRef.current;
    if (!rot || prefersReducedMotion()) return;
    let i = 0;
    let inner: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      rot.style.transition = "opacity .3s var(--ease), transform .3s var(--ease)";
      rot.style.opacity = "0";
      rot.style.transform = "translateY(-12px)";
      inner = setTimeout(() => {
        i = (i + 1) % ROTATING_WORDS.length;
        rot.textContent = ROTATING_WORDS[i];
        rot.style.transition = "none";
        rot.style.transform = "translateY(12px)";
        void rot.offsetWidth;
        rot.style.transition = "opacity .3s var(--ease), transform .3s var(--ease)";
        rot.style.opacity = "1";
        rot.style.transform = "translateY(0)";
      }, 300);
    }, 2400);
    return () => {
      clearInterval(id);
      if (inner) clearTimeout(inner);
    };
  }, []);

  // Dashboard 3D tilt (fine pointers only).
  useEffect(() => {
    const dash = dashRef.current;
    if (!dash || prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const stage = dash.parentElement;
    if (!stage) return;
    function onMove(e: PointerEvent) {
      const r = stage!.getBoundingClientRect();
      const rx = ((e.clientY - r.top) / r.height - 0.5) * -5;
      const ry = ((e.clientX - r.left) / r.width - 0.5) * 6;
      dash!.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
    }
    function onLeave() {
      dash!.style.transform = "";
    }
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Floating panel clones that dock into the dashboard on scroll. Ported from
  // the original vanilla implementation: we float CLONES of real panels (the
  // originals stay put, marked .slot-empty until their card lands).
  useEffect(() => {
    const dash = dashRef.current;
    const section = sectionRef.current;
    if (!dash || !section || prefersReducedMotion()) return;

    // Clones must live inside .lp-root — the design tokens are scoped to it.
    const host = (section.closest(".lp-root") as HTMLElement | null) ?? document.body;
    const chips = Array.from(section.querySelectorAll<HTMLElement>(".float-card"));

    const defs = [
      { sel: ".dh-att", side: "right" as const, fy: 0.16, rot: 7 },
      { sel: ".dh-assigned", side: "left" as const, fy: 0.3, rot: -6 },
      { sel: ".dh-profile", side: "right" as const, fy: 0.5, rot: 5 },
    ];
    interface FloatItem {
      clone: HTMLElement;
      src: HTMLElement;
      side: "left" | "right";
      fy: number;
      rot: number;
      empty: boolean;
    }
    const items: FloatItem[] = [];
    defs.forEach((d) => {
      const src = dash.querySelector<HTMLElement>(d.sel);
      if (!src) return;
      const clone = src.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      clone.classList.add("float-ghost");
      clone.setAttribute("aria-hidden", "true");
      clone.style.opacity = "0";
      host.appendChild(clone);
      src.classList.add("slot-empty");
      items.push({ clone, src, side: d.side, fy: d.fy, rot: d.rot, empty: true });
    });
    if (!items.length) return;

    // The clones duplicate dashboard content → hide the generic chips.
    chips.forEach((c) => (c.style.display = "none"));

    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let curP: number | null = null;

    let dockDist = 600;
    let h1L = 0;
    let h1R = 0;
    const heroH1 = section.querySelector<HTMLElement>(".hero h1, h1");
    function measure() {
      const sy = window.pageYOffset || document.documentElement.scrollTop;
      dockDist = Math.max(200, dash!.getBoundingClientRect().top + sy);
      if (heroH1) {
        const r = heroH1.getBoundingClientRect();
        h1L = r.left;
        h1R = r.right;
      }
    }
    measure();
    window.addEventListener("resize", measure);

    const narrow = window.matchMedia("(max-width: 1180px)");
    let raf = 0;
    function frame() {
      if (narrow.matches) {
        items.forEach((it) => {
          it.clone.style.opacity = "0";
          if (it.empty) {
            it.src.classList.remove("slot-empty");
            it.empty = false;
          }
        });
        raf = requestAnimationFrame(frame);
        return;
      }
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const sy = window.pageYOffset || document.documentElement.scrollTop;
      const target = clamp(sy / (dockDist * 0.85), 0, 1);
      curP = curP === null ? target : curP + (target - curP) * 0.07;
      const lin = curP;
      const p = ease(curP);
      const inv = 1 - p;
      const gap = 22;
      items.forEach((it) => {
        const sr = it.src.getBoundingClientRect();
        const gutter = it.side === "left" ? h1L : vw - h1R;
        const maxW = Math.max(120, gutter - gap * 2);
        const floatScale = Math.min(0.92, maxW / sr.width);
        const scale = floatScale + (1 - floatScale) * p;
        const visW = sr.width * floatScale;
        const floatL = it.side === "left" ? h1L - gap - visW : h1R + gap;
        const floatT = vh * it.fy;
        const left = floatL + (sr.left - floatL) * p;
        const top = floatT + (sr.top - floatT) * p;
        it.clone.style.width = sr.width + "px";
        it.clone.style.left = left + "px";
        it.clone.style.top = top + "px";
        it.clone.style.transform = `rotate(${it.rot * inv}deg) scale(${scale})`;
        it.clone.style.opacity = String(lin < 0.86 ? 1 : Math.max(0, (1 - lin) / 0.14));
        const shouldFill = lin > 0.86;
        if (shouldFill && it.empty) {
          it.src.classList.remove("slot-empty");
          it.empty = false;
        } else if (!shouldFill && !it.empty) {
          it.src.classList.add("slot-empty");
          it.empty = true;
        }
      });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      items.forEach((it) => {
        it.clone.remove();
        it.src.classList.remove("slot-empty");
      });
      chips.forEach((c) => (c.style.display = ""));
    };
  }, []);

  return (
    <section className="hero" ref={sectionRef}>
      <div className="mesh">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>
      <div className="grid-overlay" />

      <div className="wrap">
        <div className="hero-inner">
          <div className="pill reveal">
            <span className="dot">✦</span>&nbsp;<b>Multi-tenant HR suite</b> — hire to retire, in
            one place
          </div>
          <h1 className="reveal" data-d="1">
            Run your entire
            <br />
            <span className="hero-rot serif-italic gradient-text" ref={rotRef}>
              workforce
            </span>
            <br />
            on one platform
          </h1>
          <p className="sub reveal" data-d="2">
            One secure platform for the full employee lifecycle — hire, onboard, pay, manage,
            engage and grow.
          </p>
          <div className="social-proof reveal" data-d="3">
            <div className="avatars">
              <span style={{ background: "linear-gradient(135deg,#7c5cff,#5b8cff)" }}>A</span>
              <span style={{ background: "linear-gradient(135deg,#2bd9c9,#5b8cff)" }}>R</span>
              <span style={{ background: "linear-gradient(135deg,#ff7eb6,#7c5cff)" }}>M</span>
              <span style={{ background: "linear-gradient(135deg,#ffb020,#ff7eb6)" }}>K</span>
            </div>
            <div>
              <div className="stars">★★★★★</div>
              <small>
                Trusted by people teams managing <b>30,000+</b> employees
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Live dashboard mockup */}
      <div className="hero-stage wrap">
        <div className="dash-floaty">
          <div className="dashboard reveal" data-d="3" ref={dashRef}>
            <div className="dash-bar">
              <i />
              <i />
              <i />
              <span className="dash-url">app.quikhrms.com/dashboard</span>
            </div>
            <div className="dash-body">
              <aside className="dash-side">
                <div className="ds-brand">
                  <span className="ds-logo">Q</span>
                  <div className="ds-bn">
                    <b>QuikHRMS</b>
                    <small>HRMS Platform</small>
                  </div>
                </div>
                <div className="ds-group">Core</div>
                <div className="si active">
                  <span className="ico">▦</span> Dashboard
                </div>
                <div className="si">
                  <span className="ico">✓</span> To-Do
                </div>
                <div className="si">
                  <span className="ico">⛑</span> Help Desk
                </div>
                <div className="ds-group">People</div>
                <div className="si">
                  <span className="ico">◍</span> People
                </div>
                <div className="si">
                  <span className="ico">◷</span> Attendance
                </div>
                <div className="si">
                  <span className="ico">☷</span> Leaves
                </div>
                <div className="ds-group">Finance</div>
                <div className="si">
                  <span className="ico">₹</span> Payroll
                </div>
                <div className="si">
                  <span className="ico">▤</span> Expenses
                </div>
                <div className="ds-group">Growth</div>
                <div className="si">
                  <span className="ico">◎</span> Performance
                </div>
                <div className="si">
                  <span className="ico">⚲</span> Recruit
                </div>
              </aside>
              <div className="dash-main">
                <div className="dh-banner">
                  <span className="dh-rings" aria-hidden="true" />
                  <span className="dh-dots" aria-hidden="true" />
                  <div className="dh-welcome">
                    <b className="dh-hi">Hi Aarav Sharma,</b>
                    <span className="dh-glad serif-italic">glad you&rsquo;re here 👋</span>
                    <small>Here&rsquo;s what&rsquo;s happening today</small>
                  </div>
                  <div className="dh-logo">
                    <span className="dh-logo-mark">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 3a9 9 0 1 0 5.6 16.06l1.7 1.7a1 1 0 0 0 1.42-1.42l-1.7-1.7A9 9 0 0 0 12 3Zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
                          fill="currentColor"
                        />
                      </svg>
                    </span>
                    <span className="dh-logo-wm">
                      Quik<b>HRMS</b>
                    </span>
                  </div>
                </div>

                <div className="dh-cols">
                  <div className="dh-left">
                    <div className="panel dh-assigned">
                      <h5>Recently assigned</h5>
                      <div className="dh-task">
                        <span className="dh-tico t1">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M5 13l4 4L19 7"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className="dh-tlabel">Open tasks</span>
                        <b className="dh-count">1</b>
                        <span className="dh-chev">›</span>
                      </div>
                      <div className="dh-task">
                        <span className="dh-tico t2">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 18H5V9h14v11Z"
                              fill="currentColor"
                            />
                          </svg>
                        </span>
                        <span className="dh-tlabel">Leave approvals</span>
                        <b className="dh-count">9</b>
                        <span className="dh-chev">›</span>
                      </div>
                      <div className="dh-task">
                        <span className="dh-tico t3">₹</span>
                        <span className="dh-tlabel">Expense approvals</span>
                        <b className="dh-count">8</b>
                        <span className="dh-chev">›</span>
                      </div>
                    </div>
                    <div className="panel dh-cal-panel">
                      <div className="dh-cal-head">
                        <h5>Upcoming Events</h5>
                        <span>View all ›</span>
                      </div>
                      <div className="dh-cal-row">
                        <div className="dh-cal">
                          <div className="dh-cal-top">
                            <b>June 2026</b>
                            <span className="dh-cal-nav">‹&nbsp;›</span>
                          </div>
                          <MiniCalendar />
                        </div>
                        <div className="dh-cal-events">
                          <div className="dh-event">
                            <span className="dh-date">
                              <b>14</b>JUN
                            </span>
                            <div className="dh-ev-t">
                              <b>Company Foundation Day</b>
                              <small>● Company</small>
                            </div>
                            <span className="dh-days">5 days left</span>
                          </div>
                          <div className="dh-event">
                            <span className="dh-date alt">
                              <b>14</b>AUG
                            </span>
                            <div className="dh-ev-t">
                              <b>Independence Day</b>
                              <small>● National Holiday</small>
                            </div>
                            <span className="dh-days">2 mo left</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dh-right">
                    <div className="panel dh-profile">
                      <div className="dh-prof-top">
                        <span className="dh-ava">AS</span>
                        <div className="dh-prof-meta">
                          <b>Aarav Sharma</b>
                          <small>Go to my profile ›</small>
                        </div>
                      </div>
                      <button className="dh-timeoff">Request time off</button>
                    </div>
                    <div className="panel dh-att">
                      <h5>Today&rsquo;s attendance</h5>
                      <AttendanceTimer />
                      <small>Hours worked</small>
                      <button className="dh-clock">
                        <i /> Clock out
                      </button>
                    </div>
                    <div className="panel dh-essentials">
                      <div className="dh-ess-head">
                        <h5>Essentials</h5>
                      </div>
                      <div className="dh-ess-grid">
                        <div className="dh-ess">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1.5V8h4.5L14 3.5Z"
                              fill="currentColor"
                            />
                          </svg>
                          <span>Payslip</span>
                        </div>
                        <div className="dh-ess">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z"
                              fill="currentColor"
                            />
                          </svg>
                          <span>My Profile</span>
                        </div>
                        <div className="dh-ess">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm12 18H5V9h14v11Z"
                              fill="currentColor"
                            />
                          </svg>
                          <span>Calendar</span>
                        </div>
                        <div className="dh-ess">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"
                              fill="currentColor"
                            />
                          </svg>
                          <span>Documents</span>
                        </div>
                        <div className="dh-ess">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M10 3h4v4h-4V3ZM3 17h4v4H3v-4Zm14 0h4v4h-4v-4ZM12 7v4M5 17v-3h14v3"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span>Org chart</span>
                        </div>
                        <div className="dh-ess">
                          <svg viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                            <circle
                              cx="12"
                              cy="12"
                              r="3.4"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                          </svg>
                          <span>Helpdesk</span>
                        </div>
                        <div className="dh-ess">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span>Policies</span>
                        </div>
                        <div className="dh-ess">
                          <svg viewBox="0 0 24 24" fill="none">
                            <circle cx="6" cy="12" r="1.7" fill="currentColor" />
                            <circle cx="12" cy="12" r="1.7" fill="currentColor" />
                            <circle cx="18" cy="12" r="1.7" fill="currentColor" />
                          </svg>
                          <span>More</span>
                        </div>
                      </div>
                      <a className="dh-ess-more">Show more (19) ›</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="float-card fc-1">
          <span className="fc-ico" style={{ background: "linear-gradient(135deg,#2bd9c9,#5b8cff)" }}>
            ✓
          </span>
          <div>
            Payroll processed<small>1,284 payslips · ₹ on time</small>
          </div>
        </div>
        <div className="float-card fc-2">
          <span className="fc-ico" style={{ background: "linear-gradient(135deg,#7c5cff,#a78bff)" }}>
            ★
          </span>
          <div>
            New shout-out<small>Priya recognised 3 teammates</small>
          </div>
        </div>
        <div className="float-card fc-3">
          <span className="fc-ico" style={{ background: "linear-gradient(135deg,#ff7eb6,#7c5cff)" }}>
            ⚲
          </span>
          <div>
            Offer accepted<small>Senior Engineer · 94% match</small>
          </div>
        </div>
      </div>
    </section>
  );
}
