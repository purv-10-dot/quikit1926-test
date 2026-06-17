"use client";

import { useEffect, useRef } from "react";

/**
 * Page-wide effects that don't belong to a single section:
 *  - scroll-reveal: elements with `.reveal` get `.in` when they enter the
 *    viewport (CSS handles the transition + per-element delays)
 *  - cursor brush trail + custom ring/dot cursor + magnetic buttons
 *    (fine pointers only, all skipped under prefers-reduced-motion)
 *
 * Renders the brush canvas + cursor elements; everything else is imperative
 * because it spans the whole document.
 */
export function PageEffects() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  // Scroll reveal.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".lp-root .reveal"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Brush trail + custom cursor + magnetic pull.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ring = ringRef.current;
    const dot = dotRef.current;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (prefersReduced || !fine || !canvas || !ring || !dot) return;

    document.body.classList.add("has-cursor");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ringPos = { x: mouse.x, y: mouse.y };
    const last = { x: mouse.x, y: mouse.y };
    interface Point {
      x: number;
      y: number;
      life: number;
      w: number;
      c: string;
    }
    const points: Point[] = [];
    const palette = ["#7c5cff", "#5b8cff", "#2bd9c9", "#a78bff"];
    let hue = 0;
    let started = false;
    const DECAY = 0.07;
    const MAX = 70;

    function onMouseMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      dot!.style.transform = `translate(${mouse.x}px,${mouse.y}px)`;
      if (!started) {
        started = true;
        document.body.classList.add("ready");
      }
    }
    window.addEventListener("mousemove", onMouseMove);

    function seedTrail() {
      const dx = mouse.x - last.x;
      const dy = mouse.y - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1.5) {
        const steps = Math.min(Math.ceil(dist / 5), 14);
        const w = Math.min(13, 5 + dist * 0.35);
        for (let i = 0; i < steps; i++) {
          points.push({
            x: last.x + dx * (i / steps),
            y: last.y + dy * (i / steps),
            life: 1,
            w,
            c: palette[hue++ % palette.length],
          });
        }
        last.x = mouse.x;
        last.y = mouse.y;
        if (points.length > MAX) points.splice(0, points.length - MAX);
      }
    }

    let raf = 0;
    function frame() {
      ringPos.x += (mouse.x - ringPos.x) * 0.16;
      ringPos.y += (mouse.y - ringPos.y) * 0.16;
      ring!.style.transform = `translate(${ringPos.x}px,${ringPos.y}px)`;

      seedTrail();
      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        p.life -= DECAY;
        if (p.life <= 0) {
          points.splice(i, 1);
          i--;
          continue;
        }
        ctx!.globalAlpha = p.life * p.life * 0.3;
        ctx!.fillStyle = p.c;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.w * p.life, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const onLeave = () => document.body.classList.remove("ready");
    const onEnter = () => document.body.classList.add("ready");
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);

    // Magnetic pull on buttons, theme toggle and social icons.
    const magnets = Array.from(
      document.querySelectorAll<HTMLElement>(".lp-root .btn, .lp-root .theme-toggle, .lp-root .socials a"),
    );
    const magnetHandlers = magnets.map((el) => {
      el.style.transition =
        "transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s, background .25s, border-color .25s";
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${mx * 0.28}px,${my * 0.4}px)`;
      };
      const onOut = () => {
        el.style.transform = "";
      };
      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onOut);
      return { el, onMove, onOut };
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      magnetHandlers.forEach(({ el, onMove, onOut }) => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onOut);
      });
      document.body.classList.remove("has-cursor", "ready");
    };
  }, []);

  return (
    <>
      <canvas id="brush" ref={canvasRef} aria-hidden="true" />
      <div className="cursor-ring" ref={ringRef} aria-hidden="true" />
      <div className="cursor-dot" ref={dotRef} aria-hidden="true" />
    </>
  );
}
