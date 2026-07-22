'use client';

import { useEffect, useState } from 'react';
import { GraduationCap, Menu, X } from 'lucide-react';

const LINKS = [
  { href: '#platform', label: 'Platform' },
  { href: '#roles', label: 'Who it’s for' },
  { href: '#assessment', label: 'Assessment' },
  { href: '#faq', label: 'FAQ' },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'border-b border-white/10 bg-[#0b1020]/80 backdrop-blur-xl' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
            <GraduationCap className="size-4 text-white" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-white">QuikSkill</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-white/70 transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:block">
          {/* `/login` already initiates the central SSO handoff, so the CTA does
              not need to know the auth host. */}
          <a
            href="/login"
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#0b1020] transition hover:bg-white/90 active:scale-[0.98]"
          >
            Sign in
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="grid size-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-white/10 bg-[#0b1020]/95 px-5 pb-5 pt-2 backdrop-blur-xl md:hidden">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block py-2.5 text-sm text-white/75 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
          <a
            href="/login"
            className="mt-3 block rounded-full bg-white px-5 py-2.5 text-center text-sm font-semibold text-[#0b1020]"
          >
            Sign in
          </a>
        </div>
      )}
    </header>
  );
}
