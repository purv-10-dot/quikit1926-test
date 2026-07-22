"use client";

import { useEffect, useState } from "react";
import { buildLoginUrl } from "@quikit/shared/login-url";

/**
 * Public marketing nav for quikinfra.quikit.ai/.
 *
 * Login button redirects to the central QuikAuth login with a `callbackUrl`
 * that returns the user to `/dashboard` on this app's origin after a
 * successful sign-in. The auth app's `redirect` callback (see
 * packages/auth/index.ts) allow-lists the quikinfra origin so the
 * cross-origin return is honoured.
 */
const LOGIN_HREF = buildLoginUrl({
  appUrl:
    process.env.NEXT_PUBLIC_QUIKINFRA_URL ?? "http://localhost:3006",
  postLoginPath: "/dashboard",
});

// Self-serve registration lives on the central QuikAuth /register wizard
// (workspace → OTP → password), which signs the user in and lands them on the
// launcher /apps grid. Literal NEXT_PUBLIC_AUTH_URL access; dev fallback :3001.
const SIGNUP_HREF = `${(process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "")}/register`;

export default function Nav() {
  const [shrunk, setShrunk] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShrunk(window.scrollY > 80);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav ${shrunk ? "nav--shrunk" : ""}`}>
      <div className="nav-shell">
        <a href="/" className="logo nav-pill" aria-label="QuikInfra">
          <img src="/marketing/Quikinfra%20Logo.png" alt="QuikInfra — construction ERP software" />
        </a>
        {/* The .nav-cta is absolutely-positioned and animated on scroll (see
            marketing.css). Keep it as the single positioning/animation anchor,
            but neutralise its own button chrome so it acts as a flex wrapper
            for the Login + Sign Up pair. */}
        <div
          className="nav-cta nav-pill"
          style={{ display: "flex", gap: 10, background: "transparent", border: "none", padding: 0, boxShadow: "none" }}
        >
          <a
            href={SIGNUP_HREF}
            className="btn"
            style={{ background: "transparent", color: "#221507", border: "1px solid #221507" }}
          >
            Sign Up
          </a>
          <a href={LOGIN_HREF} className="btn btn-solid">
            Login
          </a>
        </div>
      </div>
    </header>
  );
}
