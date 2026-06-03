"use client";

import { useEffect, useRef } from "react";
import styles from "./NextSection.module.css";

/**
 * Background image overlay.
 *
 *  Beat A — fades in from BEHIND the hero text (no motion).
 *  Beat B — once past the hero, the inner <img> translates up at a
 *  fraction of the scroll speed, creating a parallax with the
 *  foreground content (ParallaxForeground) which scrolls at full speed.
 *
 *  bgScrubFactor < 1 → background moves slower than the page
 *  (subtle parallax). 0.6 ≈ "a bit slower than the foreground".
 */
// Scroll distance (in pixels) needed for the BG image to traverse its
// full natural height. scrub = img.offsetHeight / REF_SCROLL each frame,
// so the image moves through the SAME fraction of itself per scroll
// pixel on every viewport.
//
// Tuned so the BG drifts noticeably slower than the foreground, giving
// a clear parallax. Larger value → slower BG → stronger parallax.
// Reduced from 14000 so the image moves quicker per scroll pixel,
// shortening the time the user sees a static dashboard frame.
const REF_SCROLL = 8000;

// Hold (in viewport heights) after the hero ends before the parallax
// image starts translating. Long enough for the user to actually read
// the "Welcome to the world of QuikSocial" headline baked into the
// dashboard image — the section reads as a sticky "moment" before
// scrolling continues.
const HOLD_VH = 1.0;

export default function NextSection() {
  const overlayRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const hero = document.getElementById("hero-scrub");
      const overlay = overlayRef.current;
      const img = imgRef.current;
      if (!hero || !overlay || !img) return;

      const vh = window.innerHeight;
      const heroRange = hero.offsetHeight - vh;
      const heroOffset = hero.offsetTop;
      const scrollY = window.scrollY;

      const heroProgress = heroRange > 0
        ? Math.max(0, Math.min(1, (scrollY - heroOffset) / heroRange))
        : 0;

      // Distance scrolled past the END of the hero (in pixels). Negative
      // values mean the user is still inside the hero section.
      const scrollAfterHero = Math.max(0, scrollY - (heroOffset + heroRange));

      // Beat A — fade-in ONLY after the user clears the entire video
      // section. The dashboard image stays fully invisible while the
      // hero is still on-screen, then fades in over the first 25vh of
      // post-hero scroll so it appears quickly under the next section.
      const fade =
        heroProgress >= 1
          ? smoothstep(0, vh * 0.25, scrollAfterHero)
          : 0;
      overlay.style.opacity = fade.toFixed(3);

      // Beat B — slow parallax translate, with two pauses subtracted:
      //   1. HOLD_VH — initial breathing room after the hero ends
      //   2. pin zone scroll — while the RevealBlock is pinned and revealing

      // Subtract scroll consumed inside any pinned section so the BG
      // image freezes while those sections own the user's attention.
      let pinSkip = 0;
      for (const id of ["pin-zone", "workflow", "features-scroll", "platforms"]) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const absTop = r.top + scrollY;
        const range = el.offsetHeight - vh;
        pinSkip += Math.max(0, Math.min(range, scrollY - absTop));
      }

      const effectiveScroll = Math.max(
        0,
        scrollAfterHero - HOLD_VH * vh - pinSkip
      );
      const maxTranslate = Math.max(0, img.offsetHeight - vh);
      // Scrub factor scales with image height so every device traverses
      // the same fraction of the image per scroll pixel.
      const scrub = img.offsetHeight / REF_SCROLL;
      const ty = Math.min(maxTranslate, effectiveScroll * scrub);
      img.style.transform = `translate3d(0, ${-ty}px, 0)`;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      ref={overlayRef}
      id="next-section"
      className={styles.overlay}
      aria-hidden="true"
    >
      <img
        ref={imgRef}
        className={styles.image}
        src="/Section%202%20BG.webp"
        alt=""
      />
    </section>
  );
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Export the reference scroll length so other components can reason
// about how much scroll the BG image needs to traverse fully.
export { REF_SCROLL };
