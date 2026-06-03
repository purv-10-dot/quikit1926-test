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
        <a href={LOGIN_HREF} className="btn btn-solid nav-cta nav-pill">
          Login
        </a>
      </div>
    </header>
  );
}
