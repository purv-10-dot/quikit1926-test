"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_TIMELINE_SETTINGS,
  type TimelineViewSettings,
} from "@/app/(dashboard)/spaces/[id]/timeline/_components/timeline-view-settings";

const VIEW_KEY = "timeline-view";
const SAVE_DEBOUNCE_MS = 400;

function cacheKey(projectId: string) {
  return `quiktrack:timeline-view:${projectId}`;
}

interface ServerResponse {
  success: boolean;
  data: { settings?: Partial<TimelineViewSettings> | null } | null;
}

function merge(partial: Partial<TimelineViewSettings> | null | undefined): TimelineViewSettings {
  return { ...DEFAULT_TIMELINE_SETTINGS, ...(partial ?? {}) };
}

function readCache(projectId: string): TimelineViewSettings {
  if (typeof window === "undefined") return DEFAULT_TIMELINE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(cacheKey(projectId));
    return raw ? merge(JSON.parse(raw) as Partial<TimelineViewSettings>) : DEFAULT_TIMELINE_SETTINGS;
  } catch {
    return DEFAULT_TIMELINE_SETTINGS;
  }
}

/**
 * Per-user, per-project Timeline "View settings", persisted in
 * `qtUserViewPref.settings` (server-side, syncs across devices). A localStorage
 * cache seeds the first paint; the server is the source of truth. Mirrors
 * useBacklogViewSettings.
 */
export function useTimelineViewSettings(projectId: string) {
  const [settings, setSettings] = useState<TimelineViewSettings>(() => readCache(projectId));
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          const merged = merge(res.data.settings);
          setSettings(merged);
          try {
            window.localStorage.setItem(cacheKey(projectId), JSON.stringify(merged));
          } catch {
            /* best-effort */
          }
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const updateSettings = useCallback(
    (patch: Partial<TimelineViewSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        try {
          window.localStorage.setItem(cacheKey(projectId), JSON.stringify(next));
        } catch {
          /* non-fatal */
        }
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          fetch("/api/view-prefs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ viewKey: VIEW_KEY, projectId, settings: next }),
          }).catch(() => {
            /* silent — next change retries */
          });
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [projectId],
  );

  return { settings, updateSettings, loaded };
}
