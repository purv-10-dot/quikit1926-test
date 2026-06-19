"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useIsFetching } from "@tanstack/react-query";
import { LoaderMark } from "./loader-mark";

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
      className="fixed inset-0 z-[200] bg-white/80 flex items-center justify-center qt-route-fade-in"
    >
      <LoaderMark size={140} />
    </div>
  );
}

