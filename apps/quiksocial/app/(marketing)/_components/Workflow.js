"use client";

import { useEffect, useRef } from "react";
import styles from "./Workflow.module.css";

const STEPS = [
  {
    num: "01",
    title: "Generate",
    body:
      "Use AI to create post ideas, captions, hashtags, visuals, and campaign concepts instantly.",
  },
  {
    num: "02",
    title: "Customize",
    body:
      "Edit content, apply brand tone, collaborate with your team, and organize campaigns.",
  },
  {
    num: "03",
    title: "Schedule",
    body:
      "Publish across platforms with smart scheduling and automated workflows.",
  },
  {
    num: "04",
    title: "Analyze",
    body:
      "Track what performs, optimize future campaigns, and scale what works.",
  },
];

// Total section scroll length. 1 pin viewport + 1 viewport per card after
// the first → ~1 viewport of scroll between each card's reveal.
const PIN_VH = 1 + STEPS.length;

export default function Workflow() {
  const wrapRef = useRef(null);
  const stepRefs = useRef([]);

  useEffect(() => {
    // Mobile layout has no pin/scrub runway, so the rAF-driven reveal
    // doesn't apply. Mobile uses data-reveal + IntersectionObserver
    // instead. We listen to the media query live so a resize from
    // desktop → mobile (or vice versa) correctly reconfigures.
    const mq = window.matchMedia("(max-width: 720px)");

    let raf = 0;

    // ---- Desktop path: scroll-scrub reveal via rAF ----
    const startScrub = () => {
      const tick = () => {
        const wrap = wrapRef.current;
        if (wrap) {
          const rect = wrap.getBoundingClientRect();
          const vh = window.innerHeight;
          const range = wrap.offsetHeight - vh;
          const p =
            range > 0 ? Math.max(0, Math.min(1, -rect.top / range)) : 0;

          const N = STEPS.length;
          for (let i = 0; i < N; i++) {
            const el = stepRefs.current[i];
            if (!el) continue;
            const start = i / N;
            const end = start + 0.6 / N;
            const wp = smoothstep(start, end, p);
            el.style.opacity = String(wp);
            el.style.transform = `translate3d(${(1 - wp) * 120}px, 0, 0)`;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const stopScrub = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // ---- Mobile path: clear inline styles + tag for data-reveal ----
    const applyMobile = () => {
      stopScrub();
      stepRefs.current.forEach((el, i) => {
        if (!el) return;
        el.style.opacity = "";
        el.style.transform = "";
        el.style.setProperty("--rise", "40px");
        el.style.setProperty("--delay", `${i * 0.12}s`);
        el.setAttribute("data-reveal", "");
        // If IntersectionObserver has already passed the section, mark
        // it shown directly so steps don't sit hidden after a resize.
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          el.setAttribute("data-shown", "true");
        }
      });
    };

    const applyDesktop = () => {
      // Strip data-reveal/shown so the desktop rAF owns the visual state.
      stepRefs.current.forEach((el) => {
        if (!el) return;
        el.removeAttribute("data-reveal");
        el.removeAttribute("data-shown");
        el.style.removeProperty("--rise");
        el.style.removeProperty("--delay");
      });
      startScrub();
    };

    const apply = () => {
      if (mq.matches) applyMobile();
      else applyDesktop();
    };

    apply();
    mq.addEventListener("change", apply);

    return () => {
      stopScrub();
      mq.removeEventListener("change", apply);
    };
  }, []);

  return (
    <section
      ref={wrapRef}
      id="workflow"
      className={styles.section}
      style={{ height: `${PIN_VH * 100}vh` }}
      aria-label="Workflow"
    >
      <div className={styles.sticky}>
        <header className={styles.head} data-reveal>
          <h2 className={styles.title}>
            From Idea to Published Post <em>— In One Flow</em>
          </h2>
        </header>

        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li
              key={s.num}
              ref={(el) => (stepRefs.current[i] = el)}
              className={styles.step}
            >
              <span className={styles.num}>{s.num}</span>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.body}>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
