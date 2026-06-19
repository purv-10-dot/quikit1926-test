"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./RevealBlock.module.css";

/**
 * Pin-scrubbed reveal block.
 *
 * The outer wrapper is taller than the viewport (PIN_VH + 1 viewports);
 * the inner content sticks at top:0 for the entire pin range so the block
 * stays visually centered while the user scrolls. The reveal progress
 * (0 → 1) is driven by how much of the pin zone has been scrolled
 * through, and each word's opacity / translateY is a smoothstep slice
 * of that progress, staggered top-to-bottom.
 *
 * The wrapper carries id="pin-zone" so NextSection knows to freeze the
 * BG parallax for the same scroll range — neither layer advances until
 * every word has finished revealing.
 */
const PIN_VH = 1.5;

export default function RevealBlock({ headline, body = "" }) {
  const wrapRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const wrap = wrapRef.current;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const vh = window.innerHeight;
        const range = wrap.offsetHeight - vh;
        const scrolledIn = -rect.top;
        const p = range > 0
          ? Math.max(0, Math.min(1, scrolledIn / range))
          : 0;
        setProgress(p);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Build a flat word list across headline + body so each word gets a
  // unique stagger slot. Whitespace tokens are kept as-is to preserve spacing.
  const hl = headline.split(/(\s+)/);
  const bd = body.split(/(\s+)/);
  const totalWords =
    hl.filter((w) => !/^\s+$/.test(w)).length +
    bd.filter((w) => !/^\s+$/.test(w)).length;

  // The reveal occupies the first 85% of the pin scroll; the last 15%
  // is a hold so users don't feel the page is "stuck" before the
  // animation finishes.
  const revealEnd = 0.85;
  const wordSlot = revealEnd / totalWords;

  let wi = -1;
  const wordSpan = (w, key) => {
    if (/^\s+$/.test(w)) return w;
    wi++;
    const start = wi * wordSlot;
    const end = start + wordSlot * 2.2; // overlap for a softer reveal
    const wp = smoothstep(start, end, progress);
    // Each word lives at 0.2 opacity by default and brightens to 1.0
    // as the scroll progress sweeps past its slice.
    return (
      <span
        key={key}
        className={styles.word}
        style={{ opacity: 0.2 + wp * 0.8 }}
      >
        {w}
      </span>
    );
  };

  return (
    <div
      ref={wrapRef}
      id="pin-zone"
      className={styles.wrap}
      data-pin-vh={PIN_VH}
    >
      <div className={styles.sticky}>
        <p className={styles.headline}>
          {hl.map((w, i) => wordSpan(w, `h${i}`))}
        </p>
        {body ? (
          <p className={styles.body}>
            {bd.map((w, i) => wordSpan(w, `b${i}`))}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
