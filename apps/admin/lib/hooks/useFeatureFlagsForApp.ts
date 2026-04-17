"use client";

/**
 * FF-1 client hook — fetches this tenant's disabled-module set for admin
 * from /api/feature-flags/me once per mount and caches it in module-level
 * state so multiple sidebar/header components don't each re-fetch.
 */

import { useEffect, useState } from "react";

const EMPTY = new Set<string>();

// Module-level cache so the first component that loads the set supplies
// subsequent mounts immediately. Reset only on full page reload.
let _cached: Set<string> | null = null;
let _inflight: Promise<Set<string>> | null = null;

async function fetchDisabled(): Promise<Set<string>> {
  if (_cached) return _cached;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const r = await fetch("/api/feature-flags/me", { credentials: "include" });
      if (!r.ok) return EMPTY;
      const j = await r.json();
      const set = new Set<string>(j?.data?.disabledKeys ?? []);
      _cached = set;
      return set;
    } catch {
      return EMPTY;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

/**
 * Returns the disabled-module set for admin (for the current user's tenant).
 * During the first render it returns an empty set (default: all enabled) and
 * updates once the fetch resolves.
 */
export function useDisabledModules(): Set<string> {
  const [set, setSet] = useState<Set<string>>(_cached ?? EMPTY);
  useEffect(() => {
    if (_cached) return;
    let cancelled = false;
    fetchDisabled().then((d) => {
      if (!cancelled) setSet(d);
    });
    return () => { cancelled = true; };
  }, []);
  return set;
}
