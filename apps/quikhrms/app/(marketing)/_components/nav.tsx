"use client";

import { useEffect, useRef, useState } from "react";
import { LOGIN_HREF } from "./login-href";

/** Circular "Q" brand mark shared by nav + footer. */
export function BrandMark() {
  return (
    <span className="mark">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3a9 9 0 1 0 5.6 16.06l1.7 1.7a1 1 0 0 0 1.42-1.42l-1.7-1.7A9 9 0 0 0 12 3Zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

const NAV_LINKS = [
  { href: "#modules", label: "Modules" },
  { href: "#features", label: "Features" },
  { href: "#security", label: "Security" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

/**
 * Floating pill navbar: shrinks on scroll, drives the top scroll-progress
 * bar, owns the landing light/dark toggle (data-theme on <html> +
 * localStorage `quikhrms-theme`) and the mobile menu.
 *
 * Login goes to the central QuikAuth login (see ./login-href) carrying a
 * callbackUrl that returns the visitor to /hrms after sign-in — HRMS has no
 * local login form.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY || window.pageYOffset;
      setScrolled(y > 24);
      if (progressRef.current) {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        progressRef.current.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("quikhrms-theme", next);
    } catch {
      /* private mode */
    }
  }

  // Mobile dropdown styling matches the original vanilla implementation.
  const mobileStyle: React.CSSProperties | undefined = mobileOpen
    ? {
        display: "flex",
        position: "absolute",
        top: "64px",
        right: "24px",
        flexDirection: "column",
        background: "var(--nav-bg)",
        backdropFilter: "blur(18px)",
        padding: "12px",
        borderRadius: "16px",
        border: "1px solid var(--hairline)",
        boxShadow: "var(--shadow-md)",
      }
    : undefined;

  return (
    <>
      <div className="scroll-progress" ref={progressRef} />
      <header className={`nav${scrolled ? " scrolled" : ""}`} id="nav">
        <div className="wrap">
          <a href="#top" className="brand">
            <BrandMark />
            <span>
              Quik<b>HRMS</b>
            </span>
          </a>

          <nav className="nav-links" style={mobileStyle}>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}>
                {l.label}
              </a>
            ))}
          </nav>

          <div className="nav-right">
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode">
              <svg className="moon" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
              <svg className="sun" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <a href={LOGIN_HREF} className="btn btn-primary" style={{ padding: "10px 20px" }}>
              Login
            </a>
            <button
              className="nav-toggle"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
