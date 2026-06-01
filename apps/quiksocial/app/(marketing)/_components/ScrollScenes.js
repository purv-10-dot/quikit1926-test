"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ScrollScenes.module.css";

const SCENES = [
  {
    title: ["Go", "Beyond", "Traditional", "Social", "Media", "Management"],
    italic: [1],
    // 0-indexed word positions to break a line AFTER on laptop+ widths.
    // Yields: "Go Beyond" / "Traditional" / "Social Media" / "Management".
    breakAfter: [1, 2, 4],
    body:
      "Manual workflows, scattered tools, and endless approval cycles are slowing modern teams down. It’s time to move beyond outdated processes and scale content creation with intelligence.",
    align: "left",
  },
  {
    // "AI-Powered" is split into "AI-" and "Powered" so the line break
    // can happen INSIDE the word — yields:
    //   "Enter the AI-" / "Powered Era" / "of Content" / "Creation"
    // The Inner renderer suppresses the inter-word space when a word
    // ends with "-" so AI- glues to Powered visually.
    title: ["Enter", "the", "AI-", "Powered", "Era", "of", "Content", "Creation"],
    italic: [2, 3],
    breakAfter: [2, 4, 6],
    body:
      "QuikSocial unifies ideation, scheduling, and analytics into one intelligent workspace — so your team ships content at the speed of thought.",
    align: "right",
  },
];

const SCROLL_VH = 7;

/**
 * Computes the transform/opacity/filter for a scene at a given scroll
 * progress (0–1). Pure function so it can run in rAF without React state.
 */
/**
 * Shared exit animation: dolly zoom + slide off-screen + motion blur + fade.
 * On desktop the title flies LEFT, on mobile it drops DOWN.
 */
/**
 * Per-title timing windows along overall scroll progress (0–1).
 * Title 1 and Title 2 overlap so there's no dead air between them.
 */
// Page = 700vh → scrollMax = 600vh. T1/T2 in scroll-pixel terms unchanged
// (T1 ≈ 0 → 126vh, T2 ≈ 99 → 351vh) so the text animation feels identical.
const T1 = { start: 0.00, end: 0.21 };  // 0 → 126vh
const T2 = { start: 0.165, end: 0.585 }; // 99 → 351vh

/**
 * Continuous per-title animation — the title is always zooming and always
 * moving for the entire duration of its range. No "hold" phase.
 *
 *   scale    : grows continuously across the whole range
 *   opacity  : fades in at start, fades out at end (overlap with neighbor)
 *   slide    : kicks in near the end so the title flies off-screen
 *
 * `dir = -1` exit-left, `+1` exit-right. Mobile collapses to a downward exit.
 */
function titleStyle(local, isMobile, dir, startScale, endScale, fadeIn = true) {
  const scale   = startScale + local * (endScale - startScale);
  const fadeInAmt  = fadeIn ? smoothstep(0, 0.15, local) : 1;
  const fadeOut = 1 - smoothstep(0.80, 1.0, local);
  const opacity = Math.min(fadeInAmt, fadeOut);
  const slide   = smoothstep(0.70, 1.0, local);
  const blur    = slide * 10;

  const transform = isMobile
    ? `translate3d(0, ${slide * 120}vh, 0) scale(${scale})`
    : `translate3d(${dir * slide * 130}vw, 0, 0) scale(${scale})`;
  return { transform, opacity, blur };
}

function computeSceneStyle(i, progress, isMobile) {
  if (i === 0) {
    const local = (progress - T1.start) / (T1.end - T1.start);
    if (local <= 0) {
      // At rest before scroll: at default scale & opacity
      return { transform: "translate3d(0,0,0) scale(1)", opacity: 1, blur: 0 };
    }
    if (local >= 1) {
      // Hold the final exit transform (avoid a snap-back to default)
      const out = titleStyle(1, isMobile, -1, 1.0, 3.2, false);
      return { ...out, opacity: 0 };
    }
    return titleStyle(local, isMobile, -1, 1.0, 3.2, /* fadeIn */ false);
  }

  // Title 2 — enters near default size with a fade, then continues to dolly-zoom out
  const local = (progress - T2.start) / (T2.end - T2.start);
  if (local <= 0) {
    return { transform: "translate3d(0,0,0) scale(0.85)", opacity: 0, blur: 0 };
  }
  if (local >= 1) {
    // Hold the final exit transform
    const out = titleStyle(1, isMobile, +1, 0.85, 3.0);
    return { ...out, opacity: 0 };
  }
  return titleStyle(local, isMobile, +1, 0.85, 3.0);
}

export default function ScrollScenes() {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const sceneRefs = useRef([]);
  const [isMobile, setIsMobile] = useState(false);
  const isMobileRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const onChange = () => {
      isMobileRef.current = mq.matches;
      setIsMobile(mq.matches);
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // Progress is relative to the hero wrap, NOT the whole document, so
      // sections added below don't stretch the hero animation timeline.
      const wrap = wrapRef.current;
      let p = 0;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const range = wrap.offsetHeight - window.innerHeight;
        p = range > 0 ? Math.max(0, Math.min(1, -rect.top / range)) : 0;
      }

      // Write each scene's transform directly to the DOM — no React renders.
      for (let i = 0; i < SCENES.length; i++) {
        const el = sceneRefs.current[i];
        if (!el) continue;
        const { transform, opacity, blur } = computeSceneStyle(
          i, p, isMobileRef.current
        );
        el.style.transform = transform;
        el.style.opacity = opacity;
        el.style.filter = blur > 0.1 ? `blur(${blur}px)` : "none";
        el.style.pointerEvents = opacity > 0.5 ? "auto" : "none";
      }

      // Hide the whole fixed stage once the user has scrolled past the
      // hero. The stage is position:fixed, so without this the progress
      // track (and any residual scene chrome) would keep showing on top
      // of later sections.
      if (stageRef.current) {
        const wrapEl = wrapRef.current;
        let pastHero = false;
        if (wrapEl) {
          const r = wrapEl.getBoundingClientRect();
          pastHero = r.bottom <= 0;
        }
        stageRef.current.style.visibility = pastHero ? "hidden" : "visible";
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={wrapRef} id="hero-scrub" className={styles.wrap}>
      <div ref={stageRef} className={styles.stage}>
        {SCENES.map((scene, i) => {
          const sceneClass =
            scene.align === "right"
              ? `${styles.scene} ${styles.sceneRight}`
              : styles.scene;
          return (
            <article
              key={i}
              ref={(el) => (sceneRefs.current[i] = el)}
              className={sceneClass}
              // Scene 0 starts visible so the hero isn't pitch-black before
              // React hydrates and the rAF loop kicks in. Scene 1 stays
              // hidden until its scroll range begins.
              style={{ opacity: i === 0 ? 1 : 0 }}
            >
              <Inner scene={scene} isHero={i === 0} />
            </article>
          );
        })}

      </div>

      <div style={{ height: `${SCROLL_VH * 100}vh` }} />
    </div>
  );
}

function Inner({ scene, isHero = false }) {
  // The first hero scene gets the page's single <h1> for SEO heading
  // hierarchy. Subsequent scene titles stay as <h2>. The CSS class is
  // identical for both, so the visual styling is unchanged.
  const Heading = isHero ? "h1" : "h2";
  const breakAfter = new Set(scene.breakAfter || []);
  const italicSet = new Set(
    Array.isArray(scene.italic)
      ? scene.italic
      : scene.italic != null
      ? [scene.italic]
      : []
  );
  return (
    <>
      <Heading className={styles.display}>
        {scene.title.map((w, j) => {
          const isLast = j === scene.title.length - 1;
          // Suppress the inter-word space when this word ends with a
          // hyphen, so split words like "AI-" + "Powered" glue together
          // visually (and break at the hyphen on forced line breaks).
          const trailing = isLast || w.endsWith("-") ? "" : " ";
          return (
            <span key={j}>
              <span className={styles.word}>
                {italicSet.has(j) ? <em>{w}</em> : w}
                {trailing}
              </span>
              {breakAfter.has(j) && (
                <span className={styles.lineBreak} aria-hidden="true" />
              )}
            </span>
          );
        })}
      </Heading>

      <p className={styles.body}>{scene.body}</p>
    </>
  );
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
