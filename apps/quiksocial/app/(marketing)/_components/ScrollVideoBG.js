"use client";

import { useEffect, useRef } from "react";
import styles from "./ScrollVideoBG.module.css";

/**
 * Hero video background.
 *
 * Desktop (>=1024px): scroll-scrubbed. Every rAF tick maps scroll
 * progress → video.currentTime so frames advance in lockstep with the
 * page scroll. The video itself never plays — it's only seeked.
 *
 * Mobile + tablet (<1024px): scrubbing via `currentTime` is unreliable
 * on iOS Safari (frames don't redraw between seeks) and CPU-heavy on
 * Android (causes scroll lag). On those devices we prime the decoder
 * once so the first frame paints, then leave the video as a static
 * backdrop. No autoplay, no looping, no per-frame seeking.
 */
export default function ScrollVideoBG({
  src = "/bg.mp4",
  scrubFactor = 0.45,
  targetId = "hero-scrub",
}) {
  const videoRef = useRef(null);
  const bgRef = useRef(null);
  const targetTimeRef = useRef(0);
  const rafRef = useRef(0);
  const readyRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // iOS Safari requires these for inline rendering.
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.loop = false;
    video.pause();

    // Prime the decoder once so the first frame paints. Without this,
    // most browsers leave a paused <video> as a blank black box.
    const primeDecoder = () => {
      const p = video.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              try { video.pause(); } catch (_) {}
            });
          });
        }).catch(() => {
          // Autoplay blocked — retry on first user interaction.
          const retry = () => {
            video.play().then(() => video.pause()).catch(() => {});
            window.removeEventListener("touchstart", retry);
            window.removeEventListener("click", retry);
          };
          window.addEventListener("touchstart", retry, { once: true, passive: true });
          window.addEventListener("click", retry, { once: true });
        });
      }
    };

    // Small-screen / coarse-pointer devices can't keep up with
    // 60fps `currentTime` writes — every seek triggers a full decode
    // cycle that hangs the browser. We still scrub there, but throttle
    // to ~10 writes per second instead of every rAF tick (60×/sec).
    const isSmallScreen =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px), (pointer: coarse)").matches;
    const SEEK_THROTTLE_MS = isSmallScreen ? 100 : 0;

    const computeTarget = () => {
      if (!readyRef.current) return;
      const target = document.getElementById(targetId);
      let progress = 0;
      let pastHero = false;
      if (target) {
        const rect = target.getBoundingClientRect();
        const range = target.offsetHeight - window.innerHeight;
        progress =
          range > 0 ? Math.max(0, Math.min(1, -rect.top / range)) : 0;
        pastHero = rect.bottom <= window.innerHeight * 0.001;
      } else {
        const scrollMax =
          document.documentElement.scrollHeight - window.innerHeight;
        progress = scrollMax > 0 ? window.scrollY / scrollMax : 0;
      }

      if (bgRef.current) {
        bgRef.current.style.visibility = pastHero ? "hidden" : "visible";
      }

      // Trim 1.0s off the tail of the clip so the very last frame the
      // user sees isn't the watermark fade-out or whatever the source
      // ends on. The hero scrub now plays from 0 → (duration - 1.0).
      const END_TRIM = 1.0;
      const playableDuration = Math.max(0.1, video.duration - END_TRIM);
      const window_ =
        Math.max(0.05, Math.min(1, scrubFactor)) * playableDuration;
      targetTimeRef.current = Math.min(
        playableDuration,
        Math.max(0, progress * window_)
      );
    };

    const onMeta = () => {
      readyRef.current = true;
      primeDecoder();
      computeTarget();
    };
    if (video.readyState >= 1) onMeta();
    else video.addEventListener("loadedmetadata", onMeta);

    let lastSeekAt = 0;
    const tick = () => {
      const tgt = targetTimeRef.current;
      const now = performance.now();
      const dueForSeek =
        SEEK_THROTTLE_MS === 0 || now - lastSeekAt >= SEEK_THROTTLE_MS;
      if (
        readyRef.current &&
        dueForSeek &&
        !video.seeking &&
        Math.abs(tgt - video.currentTime) > 0.001
      ) {
        try {
          if (typeof video.fastSeek === "function") video.fastSeek(tgt);
          else video.currentTime = tgt;
          lastSeekAt = now;
        } catch (_) {}
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const onScroll = () => computeTarget();
    const onResize = () => computeTarget();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      video.removeEventListener("loadedmetadata", onMeta);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={bgRef} className={styles.bgWrap} aria-hidden="true">
      <video
        ref={videoRef}
        className={styles.video}
        src={src}
        preload="auto"
        muted
        playsInline
        disablePictureInPicture
      />
      <div className={styles.vignette} />
      <div className={styles.grain} />
    </div>
  );
}
