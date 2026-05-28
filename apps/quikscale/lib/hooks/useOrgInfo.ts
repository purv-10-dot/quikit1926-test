"use client";

/**
 * useOrgInfo — current org's identity (id, name, slug).
 *
 * Backed by `/api/org/info` (a cheap single-table lookup). The result is
 * stable for the duration of the session, so we cache it at module scope
 * to avoid refetching on every consumer mount (the header re-mounts on
 * every dashboard route change otherwise).
 *
 * Mirrors the pub/sub pattern used by `useFiscalYears` — call
 * `invalidateOrgInfoCache()` after an org rename to push a refetch to
 * every mounted consumer without a page reload.
 */
import { useEffect, useState } from "react";

export interface OrgInfo {
  id: string;
  name: string;
  slug?: string;
}

let cache: OrgInfo | null = null;
let inflight: Promise<OrgInfo | null> | null = null;
const listeners = new Set<() => void>();

async function fetchOrg(): Promise<OrgInfo | null> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/org/info")
    .then((r) => r.json())
    .then((j) => {
      if (j?.success && j?.data?.name) {
        cache = {
          id: j.data.id,
          name: j.data.name,
          slug: j.data.slug,
        };
        return cache;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export interface UseOrgInfoResult {
  org: OrgInfo | null;
  isLoading: boolean;
}

export function useOrgInfo(): UseOrgInfoResult {
  const [org, setOrg] = useState<OrgInfo | null>(cache);
  const [isLoading, setIsLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;

    function load() {
      setIsLoading(true);
      fetchOrg().then((d) => {
        if (alive) {
          setOrg(d);
          setIsLoading(false);
        }
      });
    }

    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, []);

  return { org, isLoading };
}

/**
 * Drop the module cache + push a refetch to every mounted consumer.
 * Call this after the org is renamed so the header chip updates without
 * a page reload.
 */
export function invalidateOrgInfoCache(): void {
  cache = null;
  inflight = null;
  listeners.forEach((fn) => fn());
}
