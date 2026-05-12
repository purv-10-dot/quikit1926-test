"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useIsFetching } from "@tanstack/react-query";

/**
 * Global page-transition loader. Listens for clicks on internal links and
 * shows a backdrop + animated logo until BOTH:
 *   1. the new pathname/searchParams pair commits, and
 *   2. React Query's active-fetch count drops back to zero
 * — so the user doesn't see a flash of empty content after route commit
 * while the new page is still hydrating its data.
 *
 * Hidden instantly on same-page clicks, modifier-key clicks, and links that
 * open in a new tab / external URLs.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFetching = useIsFetching();
  const [active, setActive] = useState(false);
  // Once the new route commits we treat the page as "in flight" — the loader
  // sticks around until React Query's queue is empty AND a short grace
  // window has passed, to cover queries that hadn't started yet when the
  // route committed (common with effects that run on the new page's mount).
  const [committed, setCommitted] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  // Step 1: the new page has mounted — record the commit but DON'T hide yet.
  useEffect(() => {
    if (active) setCommitted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Step 2: once committed + idle, hide after a tiny grace period. If any
  // query starts again during that grace window, the effect re-runs and the
  // timer resets — so we never tear the loader down mid-fetch.
  useEffect(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (!active || !committed) return;
    if (isFetching > 0) return;
    hideTimerRef.current = window.setTimeout(() => {
      setActive(false);
      setCommitted(false);
      hideTimerRef.current = null;
    }, 150);
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [active, committed, isFetching]);

  // Detect outbound internal nav at the click stage. We listen during the
  // capture phase so we see the click BEFORE Next's <Link> calls
  // preventDefault() — otherwise `defaultPrevented` would be true by the
  // time a bubble-phase listener runs and we'd never see SPA navigations.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a) return;
      if (a.target && a.target !== "" && a.target !== "_self") return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      // Same-route clicks shouldn't flash the loader.
      const [path, query] = href.split("?");
      if (path === pathname && (query ?? "") === (searchParams.toString() || "")) return;
      setActive(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, searchParams]);

  // Programmatic navigations (router.push / replace / back) fire this event.
  // We dispatch it from places that need to show the loader during a
  // non-link transition, e.g. form submits that redirect.
  useEffect(() => {
    function onCustom() {
      setActive(true);
    }
    window.addEventListener("qt:route-start", onCustom);
    return () => window.removeEventListener("qt:route-start", onCustom);
  }, []);

  // Safety net: hard cap so a stuck query (or a page that never fires one)
  // can't leave the user staring at the loader forever.
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => {
      setActive(false);
      setCommitted(false);
    }, 8000);
    return () => window.clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      className="fixed inset-0 z-[200] bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center qt-route-fade-in"
    >
      <LoaderMark />
      <p className="mt-4 text-xs font-medium text-gray-500 tracking-wide uppercase">
        Loading
        <span className="qt-route-dot">.</span>
        <span className="qt-route-dot qt-route-dot-2">.</span>
        <span className="qt-route-dot qt-route-dot-3">.</span>
      </p>
    </div>
  );
}

function LoaderMark() {
  return (
    <div className="relative h-24 w-24">
      {/* Soft pulsing halo */}
      <span className="absolute inset-2 rounded-full bg-gradient-to-br from-blue-400/20 via-violet-400/20 to-pink-400/20 blur-2xl qt-route-pulse" />

      {/* Outer ring — slow clockwise sweep */}
      <svg
        className="absolute inset-0 h-full w-full qt-route-spin-slow"
        viewBox="0 0 96 96"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="qt-loader-grad-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <linearGradient id="qt-loader-grad-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r="40" stroke="#eef2ff" strokeWidth="4" />
        <circle
          cx="48"
          cy="48"
          r="40"
          stroke="url(#qt-loader-grad-a)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="90 250"
        />
      </svg>

      {/* Inner ring — faster counter-clockwise sweep */}
      <svg
        className="absolute inset-0 h-full w-full qt-route-spin-reverse"
        viewBox="0 0 96 96"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="48"
          cy="48"
          r="28"
          stroke="url(#qt-loader-grad-b)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="40 180"
          opacity="0.9"
        />
      </svg>

      {/* Orbiting micro-dots — three task-cards going around */}
      <div className="absolute inset-0 qt-route-spin-slow">
        <span className="absolute left-1/2 top-1 -translate-x-1/2 block h-2 w-2 rounded-sm bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
        <span className="absolute right-1 top-1/2 -translate-y-1/2 block h-2 w-2 rounded-sm bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.6)]" />
        <span className="absolute left-1/2 bottom-1 -translate-x-1/2 block h-2 w-2 rounded-sm bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.6)]" />
      </div>

      {/* Center stack — three task cards with a staggered check-in animation */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-9 w-9">
          <span className="qt-route-card qt-route-card-1 absolute inset-0 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 shadow-md" />
          <span className="qt-route-card qt-route-card-2 absolute inset-0 rounded-md bg-gradient-to-br from-violet-500 to-pink-500 shadow-md" />
          <span className="qt-route-card qt-route-card-3 absolute inset-0 rounded-md bg-gradient-to-br from-pink-500 to-orange-400 shadow-md" />
          {/* Check mark on top */}
          <svg
            className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12 l5 5 l9-11" className="qt-route-check" />
          </svg>
        </div>
      </div>
    </div>
  );
}
