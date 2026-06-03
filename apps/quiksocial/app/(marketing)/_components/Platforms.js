"use client";

import { useEffect, useRef } from "react";
import styles from "./Platforms.module.css";

const PLATFORMS = [
  { name: "Instagram",   logo: "/Instagram.png" },
  { name: "LinkedIn",    logo: "/Linkedin.png"  },
  { name: "Facebook",    logo: "/Facebook.png"  },
  { name: "X / Twitter", logo: "/X.png"         },
  { name: "TikTok",      logo: "/Tiktok.png"    },
  { name: "YouTube",     logo: "/Youtube.png"   },
  { name: "Pinterest",   logo: "/Pinterest.png" },
];

// Shared SVG-coordinate path used by BOTH the dashed <path> and the JS
// position math, so icons sit exactly on the line.
const VIEWBOX = { w: 1200, h: 500 };
const P0 = { x: 40,  y: 400 };
const P1 = { x: 600, y: -200 };   // control point — deeper to increase curvature
const P2 = { x: 1160, y: 400 };

const PATH_D = `M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`;

function bezier(t) {
  const mt = 1 - t;
  return {
    x: mt * mt * P0.x + 2 * mt * t * P1.x + t * t * P2.x,
    y: mt * mt * P0.y + 2 * mt * t * P1.y + t * t * P2.y,
  };
}

const PIN_VH = 3;

export default function Platforms() {
  const sectionRef = useRef(null);
  const orbitRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    let raf = 0;
    const N = PLATFORMS.length;

    const tick = () => {
      const section = sectionRef.current;
      const orbit = orbitRef.current;
      if (section && orbit) {
        const rect = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const range = section.offsetHeight - vh;
        const p = range > 0
          ? Math.max(0, Math.min(1, -rect.top / range))
          : 0;

        const ow = orbit.offsetWidth;
        const oh = orbit.offsetHeight;
        const sx = ow / VIEWBOX.w;
        const sy = oh / VIEWBOX.h;

        // Interpolate along the BEZIER CURVE, not in a straight line. Each
        // icon's current parameter t lerps from 0.5 (apex) → its target
        // t = i/(N-1). bezier(t_current) stays on the curve at every frame.
        for (let i = 0; i < N; i++) {
          const el = itemRefs.current[i];
          if (!el) continue;
          const tTarget  = i / (N - 1);
          const tCurrent = 0.5 + (tTarget - 0.5) * p;
          const bz = bezier(tCurrent);
          const x = bz.x * sx - ow / 2;
          const y = bz.y * sy - oh / 2;
          el.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      ref={sectionRef}
      id="platforms"
      className={styles.section}
      style={{ height: `${PIN_VH * 100}vh` }}
      aria-label="Supported platforms"
    >
      <div className={styles.sticky}>
        <header className={styles.head} data-reveal>
          <h2 className={styles.title}>
            Built for Every Major <em>Social Platform</em>
          </h2>
          <p className={styles.body}>
            Manage all your social channels from one centralized workspace.
            Publish, monitor, and optimize content across your entire
            digital presence.
          </p>
        </header>

        <div ref={orbitRef} className={styles.orbit}>
          <svg
            className={styles.arc}
            viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d={PATH_D}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1"
              strokeDasharray="3 6"
              fill="none"
            />
          </svg>

          <ul className={styles.chips}>
            {PLATFORMS.map((p, i) => (
              <li
                key={p.name}
                ref={(el) => (itemRefs.current[i] = el)}
                className={styles.item}
              >
                <img
                  className={styles.logo}
                  src={p.logo}
                  alt={`${p.name} logo`}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
