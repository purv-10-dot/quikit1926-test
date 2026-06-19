"use client";

import { useEffect, useRef } from "react";

export default function ScrollStage() {
  const sceneRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const video = videoRef.current;
    if (!scene || !video) return;

    let duration = 0;
    let ready = false;
    let raf = 0;

    const onMeta = () => {
      duration = isFinite(video.duration) ? video.duration : 0;
      ready = duration > 0;
    };
    if (video.readyState >= 1) onMeta();
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("loadeddata", onMeta);
    try { video.pause(); } catch {}

    const tick = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const sceneRect = scene.getBoundingClientRect();
      const scrubEl = scene.querySelector(".scroll-scrub") as HTMLElement | null;
      const figureEl = scene.querySelector(".dashboard-figure") as HTMLElement | null;
      const dockEl = scene.querySelector(".dashboard-frame") as HTMLElement | null;

      let scrubProgress = 0;
      if (scrubEl) {
        const total = scrubEl.offsetHeight + vh;
        if (total > 0) {
          const scrolled = vh - sceneRect.top;
          scrubProgress = Math.min(Math.max(scrolled / total, 0), 1);
        }
      }

      let dockProgress = 0;
      if (figureEl) {
        const fr = figureEl.getBoundingClientRect();
        const range = Math.max(fr.height, 1);
        dockProgress = 1 - Math.min(Math.max((fr.top - (vh - range)) / range, 0), 1);
      }

      if (ready) {
        const t = scrubProgress * duration;
        if (Math.abs(video.currentTime - t) > 1 / 60) {
          try { video.currentTime = t; } catch {}
        }
      }

      const beforeScene = sceneRect.top >= vh;
      const figRect = figureEl?.getBoundingClientRect();
      const afterFigure = figRect ? figRect.bottom <= 0 : sceneRect.bottom <= 0;

      let exitFade = 1;
      if (figRect && figRect.top < 0) {
        const fadeRange = Math.max(figRect.height * 0.4, 1);
        exitFade = Math.max(0, Math.min(1, (figRect.bottom) / fadeRange));
      }

      if (beforeScene || afterFigure) {
        video.style.opacity = "0";
        video.style.transform = "";
        video.style.clipPath = "";
      } else {
        video.style.opacity = exitFade.toString();

        if (dockEl && dockProgress > 0) {
          const dr = dockEl.getBoundingClientRect();
          const lerp = (a: number, b: number) => a + (b - a) * dockProgress;
          const sx = lerp(1, dr.width / vw);
          const sy = lerp(1, dr.height / vh);
          const tx = lerp(0, dr.left + dr.width / 2 - vw / 2);
          const ty = lerp(0, dr.top + dr.height / 2 - vh / 2);
          video.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
          video.style.clipPath = "";
        } else {
          video.style.transform = "";
          video.style.clipPath =
            sceneRect.top > 0 ? `inset(${sceneRect.top}px 0 0 0)` : "";
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("loadeddata", onMeta);
    };
  }, []);

  return (
    <section ref={sceneRef} className="scroll-scene">
      <video
        ref={videoRef}
        className="scroll-video-fixed"
        src="/marketing/scroll-construction.mp4"
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-hidden="true"
      />
      <div className="scroll-scrub" aria-hidden="true" />
      <div className="dashboard-pin">
        <figure className="dashboard-figure">
          <img src="/marketing/Empty%20Dashboard%20.png" alt="QuikInfra ERP dashboard showing real-time materials, money, and project progress" />
          <div className="dashboard-frame" aria-hidden="true" />
        </figure>
      </div>
    </section>
  );
}
