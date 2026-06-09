"use client";

/**
 * FF-1 client hook — fetches this tenant's disabled-module set for quikscale
 * from /api/feature-flags/me once per mount and caches it at three levels:
 *
 *   1. **In-memory module cache** (`_cached`) — shared across every mount
 *      of every sidebar/header consumer in the current page lifecycle.
 *      Reset on full page reload.
 *   2. **localStorage** (`ff:me:quikscale:v1`) — persists across page
 *      reloads + tab switches. Stale-while-revalidate: hook seeds state
 *      from localStorage on first mount (instant), then refetches in
 *      background if the cached entry is older than LOCAL_TTL_MS.
 *   3. **Server Redis** (inside /api/feature-flags/me, 5 min TTL) — the
 *      fetch itself may return cached data; toggle route invalidates.
 *
 * Effect: users that navigate between tabs of the same app see zero
 * network calls to /api/feature-flags/me for the first LOCAL_TTL_MS
 * after a cold load. Stale data tops out at
 * `LOCAL_TTL_MS + Redis TTL` ≈ 5–10 min (invalidation at the toggle
 * route pulls it back fresh within seconds).
 *
 * Named with the `ForApp` suffix to disambiguate from the pre-existing
 * `useFeatureFlags` hook (tenant-scoped generic FeatureFlag model).
 */

import { useEffect, useState } from "react";

const EMPTY = new Set<string>();

// Module-level cache so the first component that loads the set supplies
// subsequent mounts immediately. Reset only on full page reload.
let _cached: Set<string> | null = null;
let _inflight: Promise<Set<string>> | null = null;

// localStorage backing — survives page reloads.
const STORAGE_KEY = "ff:me:quikscale:v1";
const LOCAL_TTL_MS = 5 * 60 * 1000; // 5 minutes; matches server Redis TTL.

interface StoredEntry {
  disabledKeys: string[];
  storedAt: number;
}

function readLocal(): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEntry;
    if (!parsed || !Array.isArray(parsed.disabledKeys) || typeof parsed.storedAt !== "number") {
      return null;
    }
    if (Date.now() - parsed.storedAt > LOCAL_TTL_MS) return null; // expired
    return new Set(parsed.disabledKeys);
  } catch {
    return null;
  }
}

function writeLocal(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const entry: StoredEntry = {
      disabledKeys: Array.from(set),
      storedAt: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Quota/private-mode errors ignored — we fall back to in-memory cache.
  }
}

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
      writeLocal(set);
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
 * Returns the disabled-module set for quikscale (for the current user's tenant).
 *
 * Seeding order on first mount:
 *   1. Module cache if already populated — instant, no fetch.
 *   2. localStorage if fresh (< LOCAL_TTL_MS) — instant, no fetch.
 *   3. Fetch + populate both caches.
 */
export function useDisabledModules(): Set<string> {
  // SSR-safe seeding. The server has no localStorage, so it always renders
  // with EMPTY (nothing disabled); the first client render MUST match that
  // HTML or React throws a hydration mismatch (the nav sections differ). So
  // we start from EMPTY and seed from the module/localStorage cache in the
  // effect below — reading localStorage in the useState initializer is what
  // diverged the first client render from the server. The seed runs right
  // after mount, so the only cost is a one-frame flash before disabled
  // modules drop out of the sidebar.
  const [set, setSet] = useState<Set<string>>(EMPTY);

  useEffect(() => {
    // Seed order: in-memory module cache (a previous mount this page-load) →
    // fresh localStorage (< LOCAL_TTL_MS) → network fetch.
    if (_cached) {
      setSet(_cached);
      if (_cached !== EMPTY) return; // authoritative in-session — skip fetch
    } else {
      const fromLocal = readLocal();
      if (fromLocal) {
        _cached = fromLocal; // hydrate module cache
        setSet(fromLocal);
        return; // readLocal() already enforced the TTL — skip fetch
      }
    }
    let cancelled = false;
    fetchDisabled().then((d) => {
      if (!cancelled) setSet(d);
    });
    return () => { cancelled = true; };
  }, []);
  return set;
}

/** Test helper — clear all caches. Not used in app code. */
export function _resetDisabledModulesCache(): void {
  _cached = null;
  _inflight = null;
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}
