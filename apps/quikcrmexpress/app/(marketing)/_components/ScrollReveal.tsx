"use client";

import { useEffect } from "react";

/**
 * Adds `.is-visible` to `[data-reveal]` elements as they scroll into view.
 *
 * Renders nothing. Progressive enhancement only — marketing.css already
 * neutralises the transform under `prefers-reduced-motion`, and if this never
 * runs the elements stay hidden, so we defensively reveal everything when
 * IntersectionObserver is unavailable rather than shipping a blank page.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    if (nodes.length === 0) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      nodes.forEach((n) => n.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  return null;
}
