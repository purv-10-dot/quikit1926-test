"use client";

import { useEffect, useRef } from "react";
import { BrandMark } from "./nav";
import { LOGIN_HREF } from "./login-href";

const STRIPS = 52;
const CELLS = 30;
const CELL_COLORS = [
  "#7c5cff",
  "#5b8cff",
  "#2bd9c9",
  "#a78bff",
  "#ff7eb6",
  "#818cf8",
  "#22d3ee",
  "#c4b5fd",
];

const LINK_GROUPS = [
  {
    title: "Product",
    links: [
      { href: "#modules", label: "Modules" },
      { href: "#features", label: "Features" },
      { href: "#lifecycle", label: "Lifecycle" },
      { href: "#engagement", label: "Engagement" },
    ],
  },
  {
    title: "Platform",
    links: [
      { href: "#security", label: "Security" },
      { href: "#testimonials", label: "Customers" },
      { href: "#pricing", label: "Pricing" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "#cta", label: "Book a demo" },
      { href: "#cta", label: "Contact" },
      { href: LOGIN_HREF, label: "Login" },
    ],
  },
];

export function Footer() {
  const boxesRef = useRef<HTMLDivElement>(null);

  // Background grid lights up cells on hover (delegated, mouse only).
  useEffect(() => {
    const boxes = boxesRef.current;
    if (!boxes || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function onOver(e: PointerEvent) {
      const c = e.target as HTMLElement;
      if (!c.classList?.contains("b-cell")) return;
      c.style.transition = "none";
      c.style.backgroundColor = CELL_COLORS[Math.floor(Math.random() * CELL_COLORS.length)];
    }
    function onOut(e: PointerEvent) {
      const c = e.target as HTMLElement;
      if (!c.classList?.contains("b-cell")) return;
      c.style.transition = "background-color 1.8s ease";
      c.style.backgroundColor = "";
    }
    boxes.addEventListener("pointerover", onOver);
    boxes.addEventListener("pointerout", onOut);
    return () => {
      boxes.removeEventListener("pointerover", onOver);
      boxes.removeEventListener("pointerout", onOut);
    };
  }, []);

  return (
    <footer className="footer">
      <div className="boxes" ref={boxesRef} aria-hidden="true">
        {Array.from({ length: STRIPS }, (_, i) => (
          <div className="b-strip" key={i}>
            {Array.from({ length: CELLS }, (_, j) => (
              <div
                key={j}
                className={`b-cell${i % 2 === 0 && j % 2 === 0 ? " plus" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="boxes-mask" aria-hidden="true" />
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <a href="#top" className="brand">
              <BrandMark />
              <span>
                Quik<b>HRMS</b>
              </span>
            </a>
            <p className="desc">
              The all-in-one HR platform for modern teams — hire, onboard, pay, manage, engage and
              grow in one secure, multi-tenant suite.
            </p>
          </div>
          {LINK_GROUPS.map((group) => (
            <div key={group.title}>
              <h5>{group.title}</h5>
              <ul>
                {group.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© 2026 QuikHRMS · Modern HR Management Suite. All rights reserved.</span>
          <div className="socials">
            <a href="#" aria-label="X">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5-6.6L5.4 22H2.3l8-9.2L1.6 2h6.9l4.6 6.1L18.9 2Zm-2.4 18h1.9L7.6 4H5.6l10.9 16Z" />
              </svg>
            </a>
            <a href="#" aria-label="LinkedIn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0ZM0 8h5v16H0V8Zm7.5 0h4.8v2.2h.07c.67-1.2 2.3-2.5 4.73-2.5 5 0 5.9 3.3 5.9 7.6V24h-5v-7.3c0-1.7 0-4-2.4-4s-2.8 1.9-2.8 3.9V24h-5V8Z" />
              </svg>
            </a>
            <a href="#" aria-label="GitHub">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.47-1.1-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
