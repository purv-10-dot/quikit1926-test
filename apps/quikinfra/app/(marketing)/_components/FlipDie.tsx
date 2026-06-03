"use client";

import { useEffect, useRef } from "react";

export default function FlipDie({ sides }: { sides: string[] }) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const cubeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const cube = cubeRef.current;
    if (!scene || !cube) return;

    let raf = 0;
    let target = 0;

    const compute = () => {
      const sr = scene.getBoundingClientRect();
      const vh = window.innerHeight;
      const range = Math.max(scene.offsetHeight - vh, 1);
      target = Math.min(Math.max(-sr.top / range, 0), 1);
    };

    const tick = () => {
      const angle = 180 + target * 270;
      cube.style.transform = `rotateX(${angle}deg)`;
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
    <div className="flip-die-scene" ref={sceneRef}>
      <div className="flip-die-pin">
        <div className="flip-die">
          <div className="flip-die-cube" ref={cubeRef}>
            <div className="flip-die-face flip-die-face--front">{sides[0]}</div>
            <div className="flip-die-face flip-die-face--top">{sides[1]}</div>
            <div className="flip-die-face flip-die-face--back">{sides[2]}</div>
            <div className="flip-die-face flip-die-face--bottom">{sides[3]}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
