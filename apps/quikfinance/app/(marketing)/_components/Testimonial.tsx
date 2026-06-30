"use client";

import { useEffect, useRef } from "react";

const QUOTE =
  '“We set up QuikTrack in a day and ran our first sprint the same week. The visibility it gives us — across sprints, bugs, and releases in one place — completely changed how our engineering and product teams communicate.”';

export default function Testimonial() {
  const wrapRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const words = Array.from(
      wrap.querySelectorAll<HTMLSpanElement>(".testimonial-word")
    );
    if (words.length === 0) return;

    const smoothstep = (a: number, b: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };

    let raf = 0;
    const tick = () => {
      const rect = wrap.getBoundingClientRect();
      const range = wrap.offsetHeight - window.innerHeight;
      const progress =
        range > 0 ? Math.max(0, Math.min(1, -rect.top / range)) : 0;

      const N = words.length;
      // Each word brightens over a span of 2 word-slots, centered on its position
      const span = 2 / N;
      for (let i = 0; i < N; i++) {
        const center = (i + 0.5) / N;
        const start = center - span / 2;
        const end = center + span / 2;
        const t = smoothstep(start, end, progress);
        words[i].style.opacity = String(0.18 + t * 0.82);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tokens = QUOTE.split(/(\s+)/);

  return (
    <section
      id="testimonial"
      ref={wrapRef as React.RefObject<HTMLElement>}
      className="testimonial-wrap"
    >
      <div className="testimonial-sticky">
        <blockquote className="testimonial-quote">
          <p className="serif testimonial-text">
            {tokens.map((tok, i) => {
              if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>;
              return (
                <span key={i} className="testimonial-word">
                  {tok}
                </span>
              );
            })}
          </p>
          <div className="testimonial-attribution">
            <span className="testimonial-attribution-label">Trusted by</span>
            <img
              src="/moreyeahs-logo.png"
              alt="MoreYeahs"
              className="testimonial-logo"
            />
          </div>
        </blockquote>
      </div>
    </section>
  );
}
