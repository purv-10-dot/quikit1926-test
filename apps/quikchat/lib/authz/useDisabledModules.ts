"use client";

/**
 * FF-1 client hook — fetches this tenant's disabled-module set for quikchat
 * from /api/feature-flags/me and caches it (module memory + localStorage +
 * server Redis). Mirrors apps/quikscale/lib/hooks/useFeatureFlagsForApp.ts.
 *
 * ⚠️ Cosmetic only. The server module gate (`gateModuleApi` in withOrgAuth)
 * is the enforcement; this just hides affordances for disabled modules so
 * there's no visible-but-broken UI.
 *
 * SSR-safe: first render returns EMPTY (server + hydrating client match), then
 * the effect hydrates from cache and revalidates once per page load.
 */

import { useEffect, useState } from "react";

const EMPTY = new Set<string>();

let _cached: Set<string> | null = null;
let _inflight: Promise<Set<string>> | null = null;
let _revalidatedThisLoad = false;
const _subscribers = new Set<(s: Set<string>) => void>();

const STORAGE_KEY = "ff:me:quikchat:v1";
const LOCAL_TTL_MS = 5 * 60 * 1000; // matches server Redis TTL

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
    const entry: StoredEntry = { disabledKeys: Array.from(set), storedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // quota / private-mode — fall back to in-memory cache.
  }
}

async function fetchDisabled(force = false): Promise<Set<string>> {
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

/** Disabled-module set for quikchat (current user's tenant). SSR-safe. */
export function useDisabledModules(): Set<string> {
  const [set, setSet] = useState<Set<string>>(EMPTY);

  useEffect(() => {
    _subscribers.add(setSet);
    const seeded = _cached ?? readLocal();
    if (seeded) {
      _cached = seeded;
      setSet(seeded);
    }
    if (!_revalidatedThisLoad) {
      _revalidatedThisLoad = true;
      void fetchDisabled(true);
    }
    return () => {
      _subscribers.delete(setSet);
    };
  }, []);

  return set;
}

/** Test helper — clear all caches. */
export function _resetDisabledModulesCache(): void {
  _cached = null;
  _inflight = null;
  _revalidatedThisLoad = false;
  _subscribers.clear();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
