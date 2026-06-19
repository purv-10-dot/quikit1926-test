"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const GRADS = [
  "linear-gradient(135deg,#7c5cff,#5b8cff)",
  "linear-gradient(135deg,#2bd9c9,#5b8cff)",
  "linear-gradient(135deg,#ff7eb6,#7c5cff)",
  "linear-gradient(135deg,#ffb020,#ff7eb6)",
];

const QUOTES = [
  { q: "Payroll that used to eat the last week of every month now takes an afternoon.", by: "Sneha Rao, Head of HR at Nimbus", in: "SR" },
  { q: "We replaced five different tools with one — and our managers actually log in now.", by: "Arjun Kapoor, People Ops Lead at Vertex Labs", in: "AK" },
  { q: "The no-code workflows are a quiet superpower. Our HR team got their week back.", by: "Meera Desai, VP People at Northwind Group", in: "MD" },
  { q: "Form-16 season went from total chaos to a single click. Genuinely.", by: "Rohit Sharma, Finance Lead at Quanta", in: "RS" },
  { q: "Onboarding a new hire is effortless now — checklists, e-sign, everything.", by: "Aisha Khan, Talent Lead at Helios", in: "AH" },
  { q: "Attendance and leave finally just work. Zero spreadsheets, zero chasing.", by: "Vikram Nair, Ops Manager at Orbit Co.", in: "VN" },
  { q: "Our attrition analytics paid for the whole platform within a month.", by: "Priya Menon, CHRO at Lumina", in: "PM" },
  { q: "Employees love the self-service — support tickets dropped by 60%.", by: "Karan Patel, HR Manager at Meridian", in: "KP" },
  { q: "RBAC and audit trails made our compliance review completely painless.", by: "Sara Joseph, Compliance at SecureNet", in: "SJ" },
  { q: "Best HR decision we've made in years. It's just the best. Period.", by: "Dev Malhotra, Founder at BrandBuilders", in: "DM" },
];

const N = QUOTES.length;
const AUTOPLAY_MS = 4500;

/**
 * Staggered testimonial deck: cards fan out around the centre card,
 * advance on a timer (paused on hover / off-screen / hidden tab /
 * reduced-motion) and wrap around without flying across the screen.
 */
export function Testimonials() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevPos = useRef<(number | undefined)[]>([]);
  const [center, setCenter] = useState(0);

  const move = useCallback((steps: number) => {
    if (!steps) return;
    setCenter((c) => (((c + steps) % N) + N) % N);
  }, []);

  // Imperative layout: transforms animate via CSS transitions between moves;
  // a card that wraps across the deck jumps without animating (transition
  // disabled for one frame) — this needs direct style access, so it stays
  // outside React's render.
  useEffect(() => {
    const cardSize = window.matchMedia("(min-width: 640px)").matches ? 365 : 290;

    function positionOf(i: number) {
      let p = i - center;
      while (p > N / 2) p -= N;
      while (p < -N / 2) p += N;
      return p;
    }

    function applyTransform(el: HTMLDivElement, p: number, size: number) {
      const isCenter = p === 0;
      const tx = (size / 1.5) * p;
      const ty = isCenter ? -65 : p % 2 ? 15 : -15;
      const rot = isCenter ? 0 : p % 2 ? 2.5 : -2.5;
      el.style.width = size + "px";
      el.style.height = size + "px";
      el.style.zIndex = isCenter ? "10" : "0";
      el.classList.toggle("center", isCenter);
      el.style.transform = `translate(-50%, -50%) translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg)`;
    }

    function layout(size: number) {
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const p = positionOf(i);
        const prev = prevPos.current[i];
        if (prev !== undefined && Math.abs(prev - p) > N / 2) {
          el.style.transition = "none";
          applyTransform(el, p, size);
          void el.offsetWidth; // force reflow so the next move animates again
          el.style.transition = "";
        } else {
          applyTransform(el, p, size);
        }
        prevPos.current[i] = p;
      });
    }

    layout(cardSize);

    let size = cardSize;
    function onResize() {
      const next = window.matchMedia("(min-width: 640px)").matches ? 365 : 290;
      if (next !== size) {
        size = next;
        layout(size);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [center]);

  // Gentle autoplay with pause conditions.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let inView = false;
    let hovering = false;
    const timer = setInterval(() => {
      if (inView && !hovering && !document.hidden) move(1);
    }, AUTOPLAY_MS);

    const onEnter = () => (hovering = true);
    const onLeave = () => (hovering = false);
    container.addEventListener("mouseenter", onEnter);
    container.addEventListener("mouseleave", onLeave);

    let io: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (es) => {
          inView = es[0].isIntersecting;
        },
        { threshold: 0.2 },
      );
      io.observe(container);
    } else {
      inView = true;
    }

    return () => {
      clearInterval(timer);
      container.removeEventListener("mouseenter", onEnter);
      container.removeEventListener("mouseleave", onLeave);
      io?.disconnect();
    };
  }, [move]);

  return (
    <section className="section" id="testimonials">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Loved by people teams</span>
          <h2>
            HR leaders who made <span className="serif-italic gradient-text">the switch</span>
          </h2>
          <p>
            From fast-scaling startups to multi-location enterprises — here&rsquo;s what teams say
            after moving to QuikHRMS.
          </p>
        </div>
        <div className="stagger reveal" ref={containerRef}>
          {QUOTES.map((t, i) => (
            <div
              key={t.in + i}
              className="st-card"
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              onClick={() => {
                let p = i - center;
                while (p > N / 2) p -= N;
                while (p < -N / 2) p += N;
                move(p);
              }}
            >
              <span className="st-line" />
              <div className="st-av" style={{ background: GRADS[i % GRADS.length] }}>
                {t.in}
              </div>
              <h3 className="st-quote">&ldquo;{t.q}&rdquo;</h3>
              <p className="st-by">- {t.by}</p>
            </div>
          ))}
          <div className="st-nav">
            <button className="st-btn" onClick={() => move(-1)} aria-label="Previous testimonial">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button className="st-btn" onClick={() => move(1)} aria-label="Next testimonial">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
