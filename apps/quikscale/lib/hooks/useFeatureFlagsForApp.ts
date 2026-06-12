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

// Whether we've already kicked off a background revalidation this page load.
// One revalidation per full load is enough — subsequent mounts read the
// (now-fresh) module cache and subscribe for updates.
let _revalidatedThisLoad = false;

// Live consumers. When a background revalidation returns fresh data we push
// it to every mounted hook, not just the one that triggered the fetch —
// otherwise a second consumer (e.g. mobile drawer) keeps the stale set.
const _subscribers = new Set<(s: Set<string>) => void>();

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

async function fetchDisabled(force = false): Promise<Set<string>> {
  // `force` bypasses the in-memory cache so a background revalidation actually
  // hits the network even when we already seeded state from a (possibly stale)
  // module/localStorage entry.
  if (!force && _cached) return _cached;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const r = await fetch("/api/feature-flags/me", { credentials: "include" });
      if (!r.ok) return _cached ?? EMPTY;
      const j = await r.json();
      const set = new Set<string>(j?.data?.disabledKeys ?? []);
      _cached = set;
      writeLocal(set);
      // Push the fresh set to every mounted consumer.
      for (const notify of _subscribers) notify(set);
      return set;
    } catch {
      return _cached ?? EMPTY;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

/**
 * Returns the disabled-module set for quikscale (for the current user's tenant).
 *
 * SSR-safe: the FIRST render returns EMPTY on both the server (no `window`)
 * and the client, so the server HTML and the hydrating client tree match.
 * Reading the module/localStorage cache synchronously here would diverge from
 * the server's all-enabled render and trip a hydration mismatch in the sidebar.
 *
 * After mount the effect hydrates from cache (instant) and revalidates:
 *   1. Module cache if populated, else fresh localStorage entry — instant.
 *   2. Background revalidation against /api/feature-flags/me, once per load.
 */
export function useDisabledModules(): Set<string> {
  // Start EMPTY to match the server render. Hydration happens in the effect.
  const [set, setSet] = useState<Set<string>>(EMPTY);

  useEffect(() => {
    // Subscribe so a background revalidation triggered by any mounted consumer
    // updates this one too.
    _subscribers.add(setSet);

    // Hydrate from the module/localStorage cache now that we're past hydration
    // (client-only — safe to read `window`). Avoids a network round-trip when
    // we already have a recent set.
    const seeded = _cached ?? readLocal();
    if (seeded) {
      _cached = seeded; // hydrate module cache
      setSet(seeded);
    }

    // True stale-while-revalidate: the seeded cache can be up to LOCAL_TTL_MS
    // stale AND is never invalidated when a super admin toggles a module from
    // the (different-origin) admin app. So always revalidate against the server
    // once per page load and adopt the fresh set. Without this, a module the
    // super admin just disabled keeps rendering in the sidebar until the
    // client cache naturally expires.
    if (!_revalidatedThisLoad) {
      _revalidatedThisLoad = true;
      void fetchDisabled(true);
    }

    return () => { _subscribers.delete(setSet); };
  }, []);
  return set;
}

/** Test helper — clear all caches. Not used in app code. */
export function _resetDisabledModulesCache(): void {
  _cached = null;
  _inflight = null;
  _revalidatedThisLoad = false;
  _subscribers.clear();
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}
