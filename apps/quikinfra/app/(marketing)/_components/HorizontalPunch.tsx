"use client";

import { useEffect, useRef } from "react";

const TEXT = "You're not losing money because of bad execution — you're losing it because of broken systems.";

export default function HorizontalPunch() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    let target = 0;
    let current = 0;
    let raf = 0;

    const compute = () => {
      const cr = container.getBoundingClientRect();
      const pin = container.querySelector(".punch-pin") as HTMLElement | null;
      const pinHeight = pin?.offsetHeight ?? 0;
      const range = Math.max(cr.height - pinHeight, 1);
      target = Math.min(Math.max(-cr.top / range, 0), 1);
    };

    const tick = () => {
      current += (target - current) * 0.1;
      if (Math.abs(target - current) < 0.0005) current = target;

      const vw = window.innerWidth;
      const trackWidth = track.scrollWidth;
      const startX = vw;
      const endX = -trackWidth;
      const x = startX + (endX - startX) * current;
      track.style.transform = `translate3d(${x}px,0,0)`;

      const words = track.querySelectorAll<HTMLElement>(".w");
      const threshold = vw * 0.55;
      const fadeRange = vw * 0.18;
      for (const w of words) {
        const wr = w.getBoundingClientRect();
        const wc = wr.left + wr.width / 2;
        if (wc <= threshold) {
          w.style.color = "#0a0a0a";
        } else {
          const fade = Math.max(0, 1 - (wc - threshold) / fadeRange);
          const shade = Math.round(206 - fade * 196);
          w.style.color = `rgb(${shade},${shade},${shade})`;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  return (
    <div className="punch-horiz" ref={containerRef}>
      <div className="punch-pin">
        <div className="punch-track" ref={trackRef}>
          {TEXT.split(" ").map((word, i) => (
            <span className="w" key={i}>{word}&nbsp;</span>
          ))}
        </div>
      </div>
    </div>
  );
}
