"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  to: number;
  from?: number;
  duration?: number;
  prefix?: string;
  separator?: string;
  suffix?: React.ReactNode;
  pad?: number;
};

const fmt = (n: number, pad?: number) => {
  const s = String(Math.max(0, Math.round(n)));
  return pad ? s.padStart(pad, "0") : s;
};

export default function CountUp({
  to,
  from,
  duration = 2400,
  prefix = "",
  separator = "–",
  suffix,
  pad,
}: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [a, setA] = useState(fmt(0, pad));
  const [b, setB] = useState(fmt(0, pad));
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const padLen = pad ?? Math.max(String(to).length, from ? String(from).length : 0);
    const max = Math.pow(10, padLen) - 1;
    const io = new IntersectionObserver(
      (entries) => {
        if (startedRef.current) return;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          startedRef.current = true;
          const start = performance.now();
          const scrambleEnd = 0.55;
          const scrambleInterval = 140;
          let lastScramble = 0;
          const tick = (now: number) => {
            const t = Math.min((now - start) / duration, 1);
            if (t < scrambleEnd) {
              if (now - lastScramble >= scrambleInterval) {
                lastScramble = now;
                setA(fmt(Math.floor(Math.random() * (max + 1)), pad));
                if (from !== undefined) setB(fmt(Math.floor(Math.random() * (max + 1)), pad));
              }
            } else {
              const t2 = (t - scrambleEnd) / (1 - scrambleEnd);
              const eased = 1 - Math.pow(1 - t2, 3);
              if (from !== undefined) {
                setA(fmt(eased * from, pad));
                setB(fmt(eased * to, pad));
              } else {
                setA(fmt(eased * to, pad));
              }
            }
            if (t < 1) requestAnimationFrame(tick);
            else {
              if (from !== undefined) {
                setA(fmt(from, pad));
                setB(fmt(to, pad));
              } else {
                setA(fmt(to, pad));
              }
            }
          };
          requestAnimationFrame(tick);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, from, duration, pad]);

  return (
    <span ref={ref}>
      {prefix}
      {a}
      {from !== undefined && (
        <>
          {separator}
          {b}
        </>
      )}
      {suffix}
    </span>
  );
}
