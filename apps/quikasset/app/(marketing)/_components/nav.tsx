import Link from "next/link";
import { LOGIN_HREF, SIGNUP_HREF } from "./login-href";

export function Nav() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-[var(--qa-border)] bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="QuikAsset">
          {/* Light marketing header → dark-badge wordmark lockup. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/quikasset-wordmark-dark.svg" alt="QuikAsset" className="h-8 w-auto" />
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[var(--qa-muted)] md:flex">
          <a href="#features" className="hover:text-[var(--qa-ink)]">Features</a>
          <a href="#lifecycle" className="hover:text-[var(--qa-ink)]">Lifecycle</a>
          <a href="#reports" className="hover:text-[var(--qa-ink)]">Reports</a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href={LOGIN_HREF}
            className="qa-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            Log in
          </a>
          <a
            href={SIGNUP_HREF}
            className="rounded-lg border border-[var(--qa-border)] px-4 py-2 text-sm font-semibold text-[var(--qa-ink)] hover:bg-[var(--qa-bg-soft)]"
          >
            Sign Up
          </a>
        </div>
      </div>
    </header>
  );
}
