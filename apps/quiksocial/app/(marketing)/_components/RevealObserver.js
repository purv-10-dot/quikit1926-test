"use client";

import { useEffect } from "react";

/**
 * Mounts once. Observes every element with `data-reveal` and flips
 * `data-shown="true"` the first time it enters the viewport, so global
 * CSS rules can animate it in.
 */
export default function RevealObserver() {
  useEffect(() => {
    // Defer one frame so children that render after this observer mounts
    // (Next.js App Router can hydrate them slightly later) are in the DOM.
    let raf = 0;
    let io = null;

    const wire = () => {
      const els = document.querySelectorAll("[data-reveal]");
      if (!els.length) {
        // Re-try next frame if children haven't hydrated yet.
        raf = requestAnimationFrame(wire);
        return;
      }
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.setAttribute("data-shown", "true");
              io.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12 }
      );
      els.forEach((el) => io.observe(el));
    };
    raf = requestAnimationFrame(wire);

    return () => {
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
    };
  }, []);

  return null;
}
