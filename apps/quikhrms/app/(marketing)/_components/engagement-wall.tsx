"use client";

import { useEffect, useRef } from "react";

const GRADS = [
  "linear-gradient(135deg,#7c5cff,#5b8cff)",
  "linear-gradient(135deg,#2bd9c9,#5b8cff)",
  "linear-gradient(135deg,#ff7eb6,#7c5cff)",
  "linear-gradient(135deg,#ffb020,#ff7eb6)",
  "linear-gradient(135deg,#5b8cff,#2bd9c9)",
  "linear-gradient(135deg,#a78bff,#7c5cff)",
  "linear-gradient(135deg,#ff9f6b,#ff7eb6)",
];

const POSTS = [
  { n: "Aarav S.", t: "Closed Q2 hiring two weeks early 🎯", r: "❤ 18", in: "AS" },
  { n: "Diya R.", t: "Shipped the new onboarding flow 🚀", r: "👏 12", in: "DR" },
  { n: "Karan M.", t: "Celebrating 5 years at QuikHRMS 🎉", r: "🎉 34", in: "KM" },
  { n: "Meera J.", t: "Huge thanks to the Ops team 🙌", r: "🙌 21", in: "MJ" },
  { n: "Priya M.", t: "recognised 3 teammates for the launch 🎉", featured: true, in: "PM" },
  { n: "Vikram I.", t: "Promoted to Engineering Lead 🥳", r: "🎊 41", in: "VI" },
  { n: "Raj P.", t: "Ran payroll for 1,284 people, on time ₹", r: "👍 16", in: "RP" },
  { n: "Neha V.", t: "Latest pulse survey hit 92% 😊", r: "📈 23", in: "NV" },
  { n: "Tara K.", t: "Welcomed 6 new joiners this week 👋", r: "👋 27", in: "TK" },
];

const COLS = 3;
const CENTER_COL = 1;
const CENTER_ROW = 1;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Scroll-expand social wall: the featured card starts blown up to panel size
 * and shrinks into its grid cell as you scroll; the other cards reveal
 * radially outward from the centre. Desktop + motion-OK only.
 */
export function EngagementWall() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const cards = POSTS.map((d, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const dx = col - CENTER_COL;
      const dy = row - CENTER_ROW;
      return {
        el: cardRefs.current[i],
        featured: !!d.featured,
        dx,
        dy,
        dist: Math.hypot(dx, dy),
      };
    });

    function showAll() {
      cards.forEach((c) => {
        if (!c.el) return;
        c.el.style.opacity = "1";
        c.el.style.transform = "none";
      });
    }

    function update() {
      const rect = section!.getBoundingClientRect();
      const total = section!.offsetHeight - window.innerHeight;
      const p = clamp(-rect.top / (total || 1), 0, 1);
      cards.forEach((c) => {
        if (!c.el) return;
        if (c.featured) {
          c.el.style.opacity = "1";
          const S = 2.7 - 1.7 * easeOut(p);
          c.el.style.transform = `scale(${S})`;
          c.el.style.setProperty("--s", String(S));
          return;
        }
        const delay = (c.dist - 1) * 0.45;
        const t = easeOut(clamp((p - delay) / 0.55, 0, 1));
        const s = 0.5 + 0.5 * t;
        const tx = c.dx * 60 * (1 - t);
        const ty = c.dy * 60 * (1 - t);
        c.el.style.opacity = String(t);
        c.el.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
      });
    }

    let enabled = !prefersReduced && window.matchMedia("(min-width: 901px)").matches;
    let ticking = false;
    function onScroll() {
      if (!enabled || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }
    function init() {
      enabled = !prefersReduced && window.matchMedia("(min-width: 901px)").matches;
      if (enabled) update();
      else showAll();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", init);
    init();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", init);
    };
  }, []);

  return (
    <section className="wall" id="engagement" ref={sectionRef}>
      <div className="wall-sticky">
        <div className="wall-head">
          <span className="eyebrow">Engagement</span>
          <h2>
            Build a culture people <span className="serif-italic gradient-text">talk about</span>
          </h2>
          <p>
            A company social wall, recognition and shout-outs — so every win gets seen and everyone
            feels heard.
          </p>
        </div>
        <div className="wall-grid" aria-hidden="true">
          {POSTS.map((d, i) => (
            <div
              key={d.in}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className={`wcard${d.featured ? " featured" : ""}`}
              style={
                {
                  "--g": d.featured ? "var(--grad-brand)" : GRADS[i % GRADS.length],
                } as React.CSSProperties
              }
            >
              {d.featured ? (
                <>
                  <span className="wc-handle">@socialwall</span>
                  <span className="wc-react">❤ Like</span>
                </>
              ) : (
                <span className="wc-react">{d.r}</span>
              )}
              <div className="wc-body">
                <span className="wc-av">{d.in}</span>
                <div className="wc-meta">
                  <b>{d.n}</b>
                  <small>{d.t}</small>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
