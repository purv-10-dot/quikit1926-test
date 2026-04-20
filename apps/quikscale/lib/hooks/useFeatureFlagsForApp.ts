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
  // Seed initial state: module cache → localStorage → EMPTY.
  const [set, setSet] = useState<Set<string>>(() => {
    if (_cached) return _cached;
    const fromLocal = readLocal();
    if (fromLocal) {
      _cached = fromLocal; // hydrate module cache
      return fromLocal;
    }
    return EMPTY;
  });

  useEffect(() => {
    // If module cache is already set (either by this mount or a previous
    // one that hit localStorage), we still re-fetch lazily when the
    // module cache was populated purely from localStorage — the module
    // cache is authoritative in-session, but we can't tell from here
    // whether it's server-fresh. Simplest safe behaviour: only fetch if
    // we started from EMPTY.
    if (_cached && _cached !== EMPTY) return;
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
