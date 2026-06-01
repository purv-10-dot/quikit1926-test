"use client";

import { useEffect, useRef } from "react";
import styles from "./FeaturesScroll.module.css";

/* ============================================================
   Per-feature mini-UI graphics.
   Each is a small "window" — chrome bar with traffic lights, then
   a body that hints at the actual product surface (chat panel,
   image grid, calendar, analytics, etc.). 160×96 viewBox.
   ============================================================ */
const TRAFFIC = (
  // Tiny window-chrome dots — used at the top of every graphic
  <>
    <circle cx="10" cy="9" r="2" fill="rgba(255,255,255,0.55)" />
    <circle cx="18" cy="9" r="2" fill="rgba(255,255,255,0.35)" />
    <circle cx="26" cy="9" r="2" fill="rgba(255,255,255,0.22)" />
  </>
);

const Graphics = {
  caption: (
    // Mini chat / caption-generation panel
    <svg viewBox="0 0 160 96" fill="none">
      {TRAFFIC}
      <line x1="0" y1="18" x2="160" y2="18" stroke="rgba(255,255,255,0.16)" />
      {/* user bubble (left) */}
      <rect x="10" y="26" width="78" height="16" rx="8" fill="rgba(255,255,255,0.08)" />
      <rect x="16" y="32" width="44" height="4" rx="2" fill="rgba(255,255,255,0.55)" />
      {/* AI response bubble (right) */}
      <rect x="60" y="48" width="92" height="38" rx="8" fill="rgba(255,255,255,0.14)" />
      <rect x="66" y="54" width="76" height="3" rx="1.5" fill="rgba(255,255,255,0.75)" />
      <rect x="66" y="61" width="68" height="3" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <rect x="66" y="68" width="52" height="3" rx="1.5" fill="rgba(255,255,255,0.45)" />
      {/* sparkle - AI marker */}
      <path d="M148 28 l2 4 4 2 -4 2 -2 4 -2-4 -4-2 4-2z" fill="rgba(255,255,255,0.9)" />
    </svg>
  ),
  visual: (
    // Image grid + generation prompt
    <svg viewBox="0 0 160 96" fill="none">
      {TRAFFIC}
      <line x1="0" y1="18" x2="160" y2="18" stroke="rgba(255,255,255,0.16)" />
      {/* prompt bar */}
      <rect x="10" y="24" width="100" height="10" rx="5" fill="rgba(255,255,255,0.10)" />
      <rect x="16" y="28" width="40" height="3" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <rect x="116" y="24" width="34" height="10" rx="5" fill="rgba(255,255,255,0.85)" />
      {/* 4 thumbnail grid */}
      <rect x="10" y="42" width="34" height="34" rx="4" fill="rgba(255,255,255,0.12)" />
      <circle cx="20" cy="52" r="3" fill="rgba(255,255,255,0.55)" />
      <path d="M14 70 l8-7 6 5 6-4" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" fill="none" />
      <rect x="48" y="42" width="34" height="34" rx="4" fill="rgba(255,255,255,0.18)" />
      <path d="M52 70 l10-9 7 6 5-4" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" fill="none" />
      <rect x="86" y="42" width="34" height="34" rx="4" fill="rgba(255,255,255,0.10)" />
      <rect x="124" y="42" width="26" height="34" rx="4" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.45)" strokeDasharray="2 3" />
      <path d="M137 53 v12 M131 59 h12" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
    </svg>
  ),
  schedule: (
    // Timeline with scheduled posts on platform lanes
    <svg viewBox="0 0 160 96" fill="none">
      {TRAFFIC}
      <line x1="0" y1="18" x2="160" y2="18" stroke="rgba(255,255,255,0.16)" />
      {/* platform lanes */}
      <circle cx="14" cy="32" r="4" fill="rgba(255,255,255,0.55)" />
      <line x1="22" y1="32" x2="156" y2="32" stroke="rgba(255,255,255,0.10)" />
      <circle cx="14" cy="50" r="4" fill="rgba(255,255,255,0.45)" />
      <line x1="22" y1="50" x2="156" y2="50" stroke="rgba(255,255,255,0.10)" />
      <circle cx="14" cy="68" r="4" fill="rgba(255,255,255,0.35)" />
      <line x1="22" y1="68" x2="156" y2="68" stroke="rgba(255,255,255,0.10)" />
      <circle cx="14" cy="86" r="4" fill="rgba(255,255,255,0.25)" />
      <line x1="22" y1="86" x2="156" y2="86" stroke="rgba(255,255,255,0.10)" />
      {/* scheduled post chips */}
      <rect x="30" y="27" width="28" height="10" rx="3" fill="rgba(255,255,255,0.22)" />
      <rect x="80" y="27" width="40" height="10" rx="3" fill="rgba(255,255,255,0.14)" />
      <rect x="44" y="45" width="50" height="10" rx="3" fill="rgba(255,255,255,0.18)" />
      <rect x="106" y="45" width="22" height="10" rx="3" fill="rgba(255,255,255,0.12)" />
      <rect x="32" y="63" width="38" height="10" rx="3" fill="rgba(255,255,255,0.14)" />
      <rect x="82" y="63" width="34" height="10" rx="3" fill="rgba(255,255,255,0.20)" />
      <rect x="46" y="81" width="32" height="10" rx="3" fill="rgba(255,255,255,0.16)" />
      <rect x="92" y="81" width="44" height="10" rx="3" fill="rgba(255,255,255,0.12)" />
      {/* now-line */}
      <line x1="70" y1="22" x2="70" y2="92" stroke="rgba(255,255,255,0.65)" strokeDasharray="2 2" />
    </svg>
  ),
  calendar: (
    // Mini month calendar with scheduled chips
    <svg viewBox="0 0 160 96" fill="none">
      {TRAFFIC}
      <line x1="0" y1="18" x2="160" y2="18" stroke="rgba(255,255,255,0.16)" />
      {/* weekday labels row */}
      <g fill="rgba(255,255,255,0.45)">
        <rect x="12" y="22" width="14" height="3" rx="1.5" />
        <rect x="32" y="22" width="14" height="3" rx="1.5" />
        <rect x="52" y="22" width="14" height="3" rx="1.5" />
        <rect x="72" y="22" width="14" height="3" rx="1.5" />
        <rect x="92" y="22" width="14" height="3" rx="1.5" />
        <rect x="112" y="22" width="14" height="3" rx="1.5" />
        <rect x="132" y="22" width="14" height="3" rx="1.5" />
      </g>
      {/* 4×7 day grid with selected cells */}
      {[
        [12, 30], [32, 30], [52, 30], [72, 30], [92, 30], [112, 30], [132, 30],
        [12, 46], [32, 46], [52, 46], [72, 46], [92, 46], [112, 46], [132, 46],
        [12, 62], [32, 62], [52, 62], [72, 62], [92, 62], [112, 62], [132, 62],
        [12, 78], [32, 78], [52, 78], [72, 78], [92, 78], [112, 78], [132, 78],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="14" height="12" rx="2" fill="rgba(255,255,255,0.06)" />
      ))}
      {/* scheduled post chips on a few days */}
      <rect x="32" y="34" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.85)" />
      <rect x="72" y="34" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <rect x="52" y="50" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.85)" />
      <rect x="112" y="50" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <rect x="92" y="66" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.85)" />
      <rect x="32" y="82" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <rect x="132" y="82" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.85)" />
      {/* selected day highlight */}
      <rect x="72" y="46" width="14" height="12" rx="2" stroke="rgba(255,255,255,0.85)" />
    </svg>
  ),
  team: (
    // Avatar stack + comment thread
    <svg viewBox="0 0 160 96" fill="none">
      {TRAFFIC}
      <line x1="0" y1="18" x2="160" y2="18" stroke="rgba(255,255,255,0.16)" />
      {/* avatar stack */}
      <circle cx="20" cy="32" r="8" fill="rgba(255,255,255,0.85)" />
      <circle cx="32" cy="32" r="8" fill="rgba(255,255,255,0.55)" stroke="rgba(10,12,16,0.8)" strokeWidth="1.5" />
      <circle cx="44" cy="32" r="8" fill="rgba(255,255,255,0.35)" stroke="rgba(10,12,16,0.8)" strokeWidth="1.5" />
      <circle cx="56" cy="32" r="8" fill="rgba(255,255,255,0.18)" stroke="rgba(10,12,16,0.8)" strokeWidth="1.5" />
      <rect x="68" y="28" width="32" height="8" rx="4" fill="rgba(255,255,255,0.18)" />
      <rect x="72" y="30" width="20" height="3" rx="1.5" fill="rgba(255,255,255,0.7)" />
      {/* comment row 1 */}
      <circle cx="14" cy="56" r="5" fill="rgba(255,255,255,0.7)" />
      <rect x="24" y="50" width="100" height="14" rx="3" fill="rgba(255,255,255,0.10)" />
      <rect x="28" y="54" width="54" height="2.5" rx="1.25" fill="rgba(255,255,255,0.65)" />
      <rect x="28" y="59" width="80" height="2.5" rx="1.25" fill="rgba(255,255,255,0.45)" />
      <rect x="128" y="54" width="20" height="6" rx="3" fill="rgba(255,255,255,0.85)" />
      {/* comment row 2 */}
      <circle cx="14" cy="80" r="5" fill="rgba(255,255,255,0.55)" />
      <rect x="24" y="74" width="110" height="14" rx="3" fill="rgba(255,255,255,0.08)" />
      <rect x="28" y="78" width="68" height="2.5" rx="1.25" fill="rgba(255,255,255,0.5)" />
      <rect x="28" y="83" width="90" height="2.5" rx="1.25" fill="rgba(255,255,255,0.35)" />
    </svg>
  ),
  analytics: (
    // Mini analytics dashboard — big number + spark chart + bars
    <svg viewBox="0 0 160 96" fill="none">
      {TRAFFIC}
      <line x1="0" y1="18" x2="160" y2="18" stroke="rgba(255,255,255,0.16)" />
      {/* KPI tile */}
      <rect x="10" y="24" width="60" height="32" rx="4" fill="rgba(255,255,255,0.10)" />
      <rect x="16" y="29" width="22" height="3" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <text x="16" y="48" fontFamily="ui-monospace, monospace" fontSize="12" fontWeight="700" fill="rgba(255,255,255,0.95)">12.4K</text>
      {/* sparkline tile */}
      <rect x="76" y="24" width="74" height="32" rx="4" fill="rgba(255,255,255,0.10)" />
      <path d="M82 50 L92 44 L100 47 L108 38 L118 41 L128 32 L138 35 L146 28" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" fill="none" />
      <path d="M82 50 L92 44 L100 47 L108 38 L118 41 L128 32 L138 35 L146 28 L146 54 L82 54 Z" fill="rgba(255,255,255,0.18)" />
      {/* bar chart row */}
      <rect x="10" y="62" width="140" height="28" rx="4" fill="rgba(255,255,255,0.06)" />
      <rect x="18" y="78" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <rect x="32" y="72" width="8" height="14" rx="1.5" fill="rgba(255,255,255,0.7)" />
      <rect x="46" y="76" width="8" height="10" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <rect x="60" y="68" width="8" height="18" rx="1.5" fill="rgba(255,255,255,0.85)" />
      <rect x="74" y="74" width="8" height="12" rx="1.5" fill="rgba(255,255,255,0.55)" />
      <rect x="88" y="70" width="8" height="16" rx="1.5" fill="rgba(255,255,255,0.7)" />
      <rect x="102" y="66" width="8" height="20" rx="1.5" fill="rgba(255,255,255,0.95)" />
      <rect x="116" y="72" width="8" height="14" rx="1.5" fill="rgba(255,255,255,0.7)" />
      <rect x="130" y="76" width="8" height="10" rx="1.5" fill="rgba(255,255,255,0.55)" />
    </svg>
  ),
};

// Bodies are deliberately kept to the same length range (~90 chars)
// so every card lands at exactly 2 lines across breakpoints. If you
// change copy here, keep the character count similar to maintain the
// even rhythm of the carousel.
const FEATURES = [
  {
    num: "01",
    title: "AI Caption Generation",
    icon: "caption",
    body:
      "Generate platform-tuned captions in seconds with AI trained for engagement and reach.",
  },
  {
    num: "02",
    title: "AI Visual Content",
    icon: "visual",
    body:
      "Create campaign visuals, on-brand creatives, and ready-to-post imagery without leaving the tool.",
  },
  {
    num: "03",
    title: "Smart Scheduling",
    icon: "schedule",
    body:
      "Schedule posts across every channel with smart timing and fully automated publishing flows.",
  },
  {
    num: "04",
    title: "Content Calendar",
    icon: "calendar",
    body:
      "Plan campaigns visually on a collaborative calendar built for modern content team workflows.",
  },
  {
    num: "05",
    title: "Team Collaboration",
    icon: "team",
    body:
      "Assign approvals, manage feedback, and streamline publishing between teams and your clients.",
  },
  {
    num: "06",
    title: "Performance Analytics",
    icon: "analytics",
    body:
      "Track engagement, audience growth, and campaign performance from one unified dashboard view.",
  },
];

/**
 * Sticky horizontal scroller.
 *
 * The outer wrap is tall (HORIZ_VH viewports). Inside, a sticky child
 * pins for the full range. A flex row of cards inside the sticky child
 * translates horizontally as a function of the wrap's scroll progress —
 * so vertical scroll becomes horizontal motion.
 */
const HORIZ_VH = 4;

export default function FeaturesScroll() {
  const wrapRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const wrap = wrapRef.current;
      const track = trackRef.current;
      if (wrap && track) {
        const rect = wrap.getBoundingClientRect();
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const range = wrap.offsetHeight - vh;
        const p = range > 0
          ? Math.max(0, Math.min(1, -rect.top / range))
          : 0;
        const maxTx = Math.max(0, track.scrollWidth - vw);
        const tx = -p * maxTx;
        track.style.transform = `translate3d(${tx}px, 0, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      ref={wrapRef}
      id="features-scroll"
      className={styles.wrap}
      style={{ height: `${HORIZ_VH * 100}vh` }}
      aria-label="Top features"
    >
      <div className={styles.sticky}>
        <header className={styles.head} data-reveal>
          <h2 className={styles.title}>
            Create Better Content in <em>Minutes</em>, Not Hours
          </h2>
        </header>

        <div ref={trackRef} className={styles.track}>
          {FEATURES.map((f, i) => {
            // Staggered cascade: varied rise (60–140 px range) + delay (0 – 0.30 s)
            const rises  = [70, 110, 90, 130, 80, 100];
            const delays = [0,  0.08, 0.16, 0.05, 0.20, 0.12];
            return (
              <article
                key={f.num}
                className={styles.card}
                data-reveal
                style={{ "--rise": `${rises[i]}px`, "--delay": `${delays[i]}s` }}
              >
                <span className={styles.num}>{f.num}</span>
                <h3 className={styles.cardTitle}>{f.title}</h3>
                <span
                  className={styles.glyph}
                  aria-hidden="true"
                  data-icon={f.icon}
                >
                  {Graphics[f.icon]}
                </span>
                <div className={styles.reveal}>
                  <p className={styles.body}>{f.body}</p>
                </div>
              </article>
            );
          })}
          {/* Trailing spacer — gives breathing room past the last card so
              the carousel doesn't end flush against the viewport edge. */}
          <div className={styles.endSpacer} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
