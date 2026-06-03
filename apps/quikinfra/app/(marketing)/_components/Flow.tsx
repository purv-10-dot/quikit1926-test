"use client";

import { useEffect, useRef, useState } from "react";

const RISES = [80, 130, 60, 110, 75, 140];

export default function Flow({ steps }: { steps: string[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`flow${visible ? " is-visible" : ""}`}
      aria-label="Operational flow"
    >
      {steps.map((label, i) => (
        <div
          className="row"
          key={i}
          style={
            {
              "--rise": `${RISES[i % RISES.length]}px`,
              "--delay": `${i * 110}ms`,
            } as React.CSSProperties
          }
        >
          <div className="step">STEP {String(i + 1).padStart(2, "0")}</div>
          <div className="label">{label}</div>
          <div className="arrow">{i === steps.length - 1 ? "●" : "↓"}</div>
        </div>
      ))}
    </div>
  );
}
