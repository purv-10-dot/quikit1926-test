import Link from "next/link";
import { Package } from "lucide-react";
import { LOGIN_HREF } from "./login-href";

export function Nav() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-[var(--qa-border)] bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--qa-primary)] text-white">
            <Package className="h-4.5 w-4.5" />
          </span>
          <span className="text-lg font-bold tracking-tight">QuikAsset</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[var(--qa-muted)] md:flex">
          <a href="#features" className="hover:text-[var(--qa-ink)]">Features</a>
          <a href="#lifecycle" className="hover:text-[var(--qa-ink)]">Lifecycle</a>
          <a href="#reports" className="hover:text-[var(--qa-ink)]">Reports</a>
        </nav>
        <a
          href={LOGIN_HREF}
          className="qa-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Log in
        </a>
      </div>
    </header>
  );
}
