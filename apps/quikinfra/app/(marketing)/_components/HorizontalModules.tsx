"use client";

import { useEffect, useRef, useState } from "react";

const MODULE_RISES = [80, 140, 70, 120];

type Module = {
  no: string;
  cat: string;
  title: string;
  items: string[];
};

export default function HorizontalModules({ modules }: { modules: Module[] }) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15 }
    );
    io.observe(track);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const section = sceneRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    let target = 0;
    let current = 0;
    let raf = 0;

    const compute = () => {
      const sr = section.getBoundingClientRect();
      const pin = section.querySelector(".modules-pin") as HTMLElement | null;
      const pinHeight = pin?.offsetHeight ?? window.innerHeight;
      const range = Math.max(sr.height - pinHeight, 1);
      target = Math.min(Math.max(-sr.top / range, 0), 1);
    };

    const tick = () => {
      current += (target - current) * 0.1;
      if (Math.abs(target - current) < 0.0005) current = target;

      const trackWidth = track.scrollWidth;
      const vw = window.innerWidth;
      const max = Math.max(trackWidth - vw, 0);
      track.style.transform = `translate3d(${-current * max}px,0,0)`;
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
    <div className="modules-h" ref={sceneRef}>
      <div className="modules-pin">
        <div className="modules-header">
          <div className="section-head">
            <h2>Core Modules</h2>
            <div className="rule" />
            <div className="num">03</div>
          </div>
          <div className="section-body">
            <p className="lead">Everything you need to run construction — built in.</p>
            <div>
              <p>
                Four tightly integrated modules covering the full operating loop —
                from project planning at HQ to material issue at the gate.
              </p>
            </div>
          </div>
        </div>
        <div className="modules-viewport">
          <div className={`modules-track${visible ? " is-visible" : ""}`} ref={trackRef}>
            {modules.map((m, i) => (
              <article
                className="module"
                key={m.no}
                style={{
                  ["--rise" as string]: `${MODULE_RISES[i % MODULE_RISES.length]}px`,
                  ["--delay" as string]: `${i * 130}ms`,
                }}
              >
                <div className="meta"><span>{m.no}</span><span>{m.cat}</span></div>
                <h3>{m.title}</h3>
                <ul>
                  {m.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
