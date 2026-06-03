"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Mounts Lenis once at the root.
 *
 * Lenis hijacks the wheel/touch input and animates document scroll via
 * requestAnimationFrame, so window.scrollY still updates and native
 * `scroll` event listeners (like the video scrubber + scene progress)
 * keep working — they just glide instead of snap.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expoOut
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      syncTouch: false, // safer on Safari / iOS
      lerp: 0.1,
    });

    // Expose so any component (e.g. modals) can stop/start scrolling.
    if (typeof window !== "undefined") window.__lenis = lenis;

    let raf = 0;
    const tick = (time) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      if (typeof window !== "undefined") delete window.__lenis;
    };
  }, []);

  return null;
}
