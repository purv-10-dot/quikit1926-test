"use client";

import { useEffect, useRef, useState } from "react";

const ROLE_RISES = [70, 120, 90, 140];

type Role = { ix: string; title: string; line: string; tag: string };

export default function Roles({ roles }: { roles: Role[] }) {
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
    <div ref={ref} className={`roles${visible ? " is-visible" : ""}`}>
      {roles.map((r, i) => (
        <div
          className="role"
          key={r.ix}
          style={{
            ["--rise" as string]: `${ROLE_RISES[i % ROLE_RISES.length]}px`,
            ["--delay" as string]: `${i * 110}ms`,
          }}
        >
          <div className="ix">{r.ix}</div>
          <div className="role-title">{r.title}</div>
          <div className="role-line">{r.line}</div>
          <div className="tag">{r.tag}</div>
        </div>
      ))}
    </div>
  );
}
