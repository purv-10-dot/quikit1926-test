'use client';

import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MonitorPlay,
  PlayCircle,
  ScrollText,
  ShieldCheck,
} from './icons';

const ROTATING = ['schools', 'enterprises', 'compliance teams', 'training providers'];

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const COURSES = [
  { title: 'Fire Safety & Evacuation', meta: 'Module 3 of 6 · SCORM 2004', pct: 72, tint: '#6366f1', Icon: MonitorPlay },
  { title: 'Data Protection Essentials', meta: 'Module 2 of 4 · Video + quiz', pct: 45, tint: '#8b5cf6', Icon: BookOpen },
  { title: 'Workplace Conduct', meta: 'Module 5 of 5 · Final quiz due', pct: 92, tint: '#22d3ee', Icon: ClipboardCheck },
];

/**
 * Hero: mesh background, kinetic rotating audience word, CTAs, and a learner
 * dashboard mockup that tilts under a fine pointer.
 *
 * Deliberately lighter than the QuikHRMS hero it is modelled on: that one
 * clones real panels and flies them into the mockup on scroll (~250 lines of
 * imperative geometry). The docking animation is the first thing to break when
 * the mockup markup changes, so this keeps the mesh, the chips and the tilt —
 * the parts that carry the look — and leaves the choreography out.
 */
export default function Hero() {
  const dashRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef<HTMLSpanElement>(null);

  // Kinetic rotating word in the eyebrow pill.
  useEffect(() => {
    const rot = rotRef.current;
    if (!rot || prefersReducedMotion()) return;
    let i = 0;
    let inner: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      rot.style.transition = 'opacity .3s var(--lp-ease), transform .3s var(--lp-ease)';
      rot.style.opacity = '0';
      rot.style.transform = 'translateY(-10px)';
      inner = setTimeout(() => {
        i = (i + 1) % ROTATING.length;
        rot.textContent = ROTATING[i];
        rot.style.transition = 'none';
        rot.style.transform = 'translateY(10px)';
        void rot.offsetWidth; // force reflow so the entry transition replays
        rot.style.transition = 'opacity .3s var(--lp-ease), transform .3s var(--lp-ease)';
        rot.style.opacity = '1';
        rot.style.transform = 'translateY(0)';
      }, 300);
    }, 2600);
    return () => {
      clearInterval(id);
      if (inner) clearTimeout(inner);
    };
  }, []);

  // Mockup 3D tilt + one-shot `.in` class that starts the bar/progress fills.
  useEffect(() => {
    const dash = dashRef.current;
    if (!dash) return;

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.25 },
      );
      io.observe(dash);
      // Tilt is pointer-only; the observer above still needs cleaning up.
      if (prefersReducedMotion() || !window.matchMedia('(pointer: fine)').matches) {
        return () => io.disconnect();
      }
      const stage = dash.parentElement;
      if (!stage) return () => io.disconnect();
      function onMove(e: PointerEvent) {
        const r = stage!.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -5;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * 6;
        dash!.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
      }
      function onLeave() {
        dash!.style.transform = '';
      }
      stage.addEventListener('pointermove', onMove);
      stage.addEventListener('pointerleave', onLeave);
      return () => {
        io.disconnect();
        stage.removeEventListener('pointermove', onMove);
        stage.removeEventListener('pointerleave', onLeave);
      };
    }
    dash.classList.add('in');
  }, []);

  return (
    <section className="hero" id="top">
      <div className="mesh" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>
      <div className="grid-overlay" aria-hidden="true" />

      {/* Floating gutter chips — desktop only (hidden under 1180px in CSS). */}
      <div className="hero-chip hc-1" aria-hidden="true">
        <span className="hc-i" style={{ background: '#6366f1' }}>
          <Award />
        </span>
        <div>
          Certificate issued
          <small>Fire Safety · verified</small>
        </div>
      </div>
      <div className="hero-chip hc-2" aria-hidden="true">
        <span className="hc-i" style={{ background: '#22d3ee' }}>
          <ShieldCheck />
        </span>
        <div>
          Proctored attempt
          <small>Fullscreen enforced</small>
        </div>
      </div>
      <div className="hero-chip hc-3" aria-hidden="true">
        <span className="hc-i" style={{ background: '#8b5cf6' }}>
          <MonitorPlay />
        </span>
        <div>
          SCORM 2004
          <small>Progress reported back</small>
        </div>
      </div>

      <div className="wrap">
        <div className="hero-inner">
          <span className="pill">
            <i className="dot" />
            Multi-tenant · built for{' '}
            <b style={{ color: 'var(--lp-text)', fontWeight: 600 }}>
              <span className="hero-rot" ref={rotRef}>
                schools
              </span>
            </b>
          </span>

          <h1>
            Training that actually <span className="serif-italic gradient-text">proves</span> itself
          </h1>

          <p className="sub">
            Author the course, deliver it, assess it under proctoring, and hand out a certificate an
            employer can verify — without stitching four tools together.
          </p>

          <div className="hero-cta">
            <a href="/login" className="btn btn-primary btn-lg">
              Sign in
              <ArrowRight />
            </a>
            <a href="#platform" className="btn btn-ghost btn-lg">
              See what it does
            </a>
          </div>

          <ul className="proof">
            <li>
              <MonitorPlay /> SCORM 1.2 &amp; 2004
            </li>
            <li>
              <ShieldCheck /> Proctored assessments
            </li>
            <li>
              <Award /> Verifiable certificates
            </li>
          </ul>
        </div>
      </div>

      {/* ---------------- Learner dashboard mockup ---------------- */}
      <div className="wrap">
        <div className="hero-stage">
          <div className="float-card fc-1" aria-hidden="true">
            <span className="fc-ico" style={{ background: '#16a34a' }}>
              <ClipboardCheck />
            </span>
            <div>
              Quiz passed
              <small>86% · above threshold</small>
            </div>
          </div>
          <div className="float-card fc-2" aria-hidden="true">
            <span className="fc-ico" style={{ background: '#6366f1' }}>
              <ScrollText />
            </span>
            <div>
              Certificate ready
              <small>QR verification live</small>
            </div>
          </div>
          <div className="float-card fc-3" aria-hidden="true">
            <span className="fc-ico" style={{ background: '#f59e0b' }}>
              <Calendar />
            </span>
            <div>
              Exam in 2 days
              <small>Proctoring enabled</small>
            </div>
          </div>

          <div className="lms-dash" ref={dashRef}>
            <div className="dash-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <span className="dash-url">quikskill.app / learner</span>
            </div>

            <div className="dash-body">
              <aside className="dash-side" aria-hidden="true">
                <div className="ds-brand">
                  <span className="ds-logo">
                    <GraduationCap />
                  </span>
                  <span className="ds-bn">
                    <b>QuikSkill</b>
                    <small>Learner</small>
                  </span>
                </div>
                <span className="ds-group">Learning</span>
                <span className="si active">
                  <LayoutDashboard /> Dashboard
                </span>
                <span className="si">
                  <BookOpen /> My courses <em className="si-badge">3</em>
                </span>
                <span className="si">
                  <ClipboardCheck /> Exams <em className="si-badge">1</em>
                </span>
                <span className="si">
                  <FileText /> Homework
                </span>
                <span className="ds-group">Record</span>
                <span className="si">
                  <Award /> Certificates
                </span>
                <span className="si">
                  <Calendar /> Schedule
                </span>
              </aside>

              <div className="dash-main">
                <div className="ld-banner">
                  <div className="ld-dots" aria-hidden="true" />
                  <div className="ld-rings" aria-hidden="true" />
                  <div className="ld-welcome">
                    <span className="ld-hi">Welcome back,</span>
                    <span className="ld-glad serif-italic">Aarav</span>
                    <small>3 courses in progress · 1 exam scheduled this week</small>
                  </div>
                  <div className="ld-streak">
                    <b>12</b>
                    <small>day streak</small>
                  </div>
                </div>

                <div className="ld-kpis">
                  <div className="ld-kpi">
                    <small>In progress</small>
                    <b>3</b>
                    <span className="trend">2 due this month</span>
                  </div>
                  <div className="ld-kpi">
                    <small>Average score</small>
                    <b>82%</b>
                    <span className="trend">▲ 6% vs last quarter</span>
                  </div>
                  <div className="ld-kpi">
                    <small>Certificates</small>
                    <b>7</b>
                    <span className="trend">all verifiable</span>
                  </div>
                </div>

                <div className="ld-cols">
                  <div className="ld-left">
                    <div className="panel">
                      <h5>
                        Continue learning <span>View all</span>
                      </h5>
                      {COURSES.map((c) => (
                        <div className="ld-course" key={c.title}>
                          <span className="ld-thumb" style={{ background: c.tint }}>
                            <c.Icon />
                          </span>
                          <div className="ld-ct">
                            <b>{c.title}</b>
                            <small>{c.meta}</small>
                            <div className="ld-prog">
                              <i style={{ '--w': `${c.pct}%` } as React.CSSProperties} />
                            </div>
                          </div>
                          <span className="ld-pct">{c.pct}%</span>
                        </div>
                      ))}
                    </div>

                    <div className="panel">
                      <h5>
                        Upcoming <span className="live">● Live</span>
                      </h5>
                      <div className="ld-exam" style={{ marginBottom: '10px' }}>
                        <span className="ld-date">
                          <b>18</b>
                          Mar
                        </span>
                        <div className="ld-ev">
                          <b>Fire Safety — final exam</b>
                          <small>45 min · 30 questions · randomised</small>
                        </div>
                        <span className="ld-tag proctored">Proctored</span>
                      </div>
                      <div className="ld-exam">
                        <span className="ld-date alt">
                          <b>21</b>
                          Mar
                        </span>
                        <div className="ld-ev">
                          <b>Live class — Incident reporting</b>
                          <small>Batch B · 10:00 IST</small>
                        </div>
                        <span className="ld-tag">Batch B</span>
                      </div>
                    </div>
                  </div>

                  <div className="ld-right">
                    <div className="panel">
                      <h5>Assessment average</h5>
                      <div className="ld-donut" aria-hidden="true" />
                      <div className="ld-legend">
                        <i>
                          Passed <b>9</b>
                        </i>
                        <i>
                          Attempts used <b>11</b>
                        </i>
                        <i>
                          Best score <b>96%</b>
                        </i>
                      </div>
                    </div>

                    <div className="panel">
                      <h5>Latest certificate</h5>
                      <div className="ld-cert">
                        <span className="ld-seal">
                          <Award />
                        </span>
                        <div className="ld-ev">
                          <b>Workplace Conduct</b>
                          <small>Issued 04 Mar · verifiable</small>
                        </div>
                        <span className="ld-qr" aria-hidden="true" />
                      </div>
                    </div>

                    <div className="panel">
                      <h5>Resume</h5>
                      <div className="ld-cert">
                        <span className="ld-seal" style={{ background: '#8b5cf6' }}>
                          <PlayCircle />
                        </span>
                        <div className="ld-ev">
                          <b>Module 3 · Evacuation drill</b>
                          <small>Stopped at 04:12</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
