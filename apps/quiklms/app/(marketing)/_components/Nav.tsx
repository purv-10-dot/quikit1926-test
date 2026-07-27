'use client';

import { useEffect, useRef, useState } from 'react';
import { GraduationCap, Menu } from './icons';

/** Brand mark shared by the nav and the footer. */
export function BrandMark() {
  return (
    <span className="mark">
      <GraduationCap width={2.2} />
    </span>
  );
}

const NAV_LINKS = [
  { href: '#platform', label: 'Platform' },
  { href: '#roles', label: 'Who it’s for' },
  { href: '#assessment', label: 'Assessment' },
  { href: '#journey', label: 'Journey' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * Floating pill navbar: shrinks on scroll, drives the top scroll-progress bar,
 * and owns the landing's light/dark toggle (`data-theme` on <html> +
 * localStorage `quikskill-theme`). That is deliberately separate from the
 * dashboard's `.dark` class + `theme` key, so toggling the marketing page
 * never changes how the authenticated app renders.
 *
 * "Sign in" points at the LOCAL `/login`, which now bounces to the central
 * QuikAuth login through the shared post-login bridge (`buildLoginUrl` →
 * `${AUTH_URL}/api/post-login` → this app's `/auth-handoff`), exactly like
 * quikscale/quikinfra. It deliberately does NOT use `signIn('quikit')` (the
 * OAuth authorize flow), whose access-denied path bounces users to the launcher
 * `/apps` instead of showing this app's access-denied popup. For the bridge's
 * cross-origin callback to be honoured, this app's origin must be on the auth
 * host's `AUTH_ALLOWED_RETURN_ORIGINS` allow-list.
 *
 * "Sign up" points at the central auth host's self-serve `/register`
 * (`NEXT_PUBLIC_AUTH_URL`) — the same target the shared SignInComponent uses
 * for its `signUpUrl`. Registration creates a new workspace and lands on the
 * launcher, so — unlike Sign in — there is no per-app callback to preserve.
 */
export default function Nav() {
  // Central auth self-serve registration. NEXT_PUBLIC_AUTH_URL is the auth
  // host (the register page lives there, not in this app). Fall back to the
  // local login if it is unset so the button is never a dead link.
  const authBase = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, '');
  const signUpHref = authBase ? `${authBase}/register` : '/login';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY || window.pageYOffset;
      setScrolled(y > 24);
      if (progressRef.current) {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        progressRef.current.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('quikskill-theme', next);
    } catch {
      /* storage blocked (private mode) — the toggle still works for this view */
    }
  }

  const mobileStyle: React.CSSProperties | undefined = mobileOpen
    ? {
        display: 'flex',
        position: 'absolute',
        top: '64px',
        right: '24px',
        flexDirection: 'column',
        background: 'var(--lp-nav-bg)',
        backdropFilter: 'blur(18px)',
        padding: '12px',
        borderRadius: '16px',
        border: '1px solid var(--lp-hairline)',
        boxShadow: 'var(--lp-shadow-md)',
      }
    : undefined;

  return (
    <>
      <div className="scroll-progress" ref={progressRef} />
      <header className={`nav${scrolled ? ' scrolled' : ''}`}>
        <div className="wrap">
          <a href="#top" className="brand">
            <BrandMark />
            <span>
              Quik<b>Skill</b>
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
            <a href={signUpHref} className="btn btn-ghost" style={{ padding: '10px 20px' }}>
              Sign up
            </a>
            <a href="/login" className="btn btn-primary" style={{ padding: '10px 20px' }}>
              Sign in
            </a>
            <button className="nav-toggle" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu">
              <Menu />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
