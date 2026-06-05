"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_VIEW_SETTINGS,
  type BacklogViewSettings,
} from "@/app/(dashboard)/spaces/[id]/backlog/_components/view-settings-popover";

const VIEW_KEY = "backlog-view";
const SAVE_DEBOUNCE_MS = 400;

/** Existing per-device cache key — reused so current users keep their setting. */
function cacheKey(projectId: string) {
  return `quiktrack:backlog-view:${projectId}`;
}

interface ServerResponse {
  success: boolean;
  data: { settings?: Partial<BacklogViewSettings> | null } | null;
}

/** Deep-merge a partial blob over the defaults (fields merged one level deep). */
function mergeSettings(
  partial: Partial<BacklogViewSettings> | null | undefined,
): BacklogViewSettings {
  return {
    ...DEFAULT_VIEW_SETTINGS,
    ...(partial ?? {}),
    fields: { ...DEFAULT_VIEW_SETTINGS.fields, ...(partial?.fields ?? {}) },
  };
}

function readCache(projectId: string): BacklogViewSettings {
  if (typeof window === "undefined") return DEFAULT_VIEW_SETTINGS;
  try {
    const raw = window.localStorage.getItem(cacheKey(projectId));
    return raw
      ? mergeSettings(JSON.parse(raw) as Partial<BacklogViewSettings>)
      : DEFAULT_VIEW_SETTINGS;
  } catch {
    return DEFAULT_VIEW_SETTINGS;
  }
}

/**
 * Persists per-user, per-org, per-project backlog "View settings" (epic panel,
 * empty sprints, density, field toggles) in `qtUserViewPref.settings`
 * (server-side, syncs across devices and survives logout/login).
 *
 * A localStorage cache (the original key) seeds the initial paint to avoid a
 * flash of defaults, and is written through on every change; the server is the
 * source of truth and reconciles the cache once it loads.
 */
export function useBacklogViewSettings(projectId: string) {
  const [settings, setSettings] = useState<BacklogViewSettings>(() =>
    readCache(projectId),
  );
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from the server once per project; reconcile over the cached seed.
  useEffect(() => {
    let cancelled = false;
    setSettings(readCache(projectId));
    setLoaded(false);
    const params = new URLSearchParams({ viewKey: VIEW_KEY, projectId });
    fetch(`/api/view-prefs?${params.toString()}`)
      .then((r) => r.json() as Promise<ServerResponse>)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.settings) {
          const merged = mergeSettings(res.data.settings);
          setSettings(merged);
          try {
            window.localStorage.setItem(cacheKey(projectId), JSON.stringify(merged));
          } catch {
            /* cache write is best-effort */
          }
        }
        setLoaded(true);
      })
      .catch(() => {
        // Best-effort: run with the cached/default settings; next save recovers.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const updateSettings = useCallback(
    (patch: Partial<BacklogViewSettings>) => {
      setSettings((prev) => {
        const next: BacklogViewSettings = {
          ...prev,
          ...patch,
          fields: { ...prev.fields, ...(patch.fields ?? {}) },
        };
        // Write-through cache for instant paint on the next load.
        try {
          window.localStorage.setItem(cacheKey(projectId), JSON.stringify(next));
        } catch {
          /* storage full / unavailable — non-fatal */
        }
        // Debounced server persist (full blob).
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          fetch("/api/view-prefs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              viewKey: VIEW_KEY,
              projectId,
              settings: next,
            }),
          }).catch(() => {
            // Silent fail — next change retries.
          });
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [projectId],
  );

  return { settings, updateSettings, loaded };
}
