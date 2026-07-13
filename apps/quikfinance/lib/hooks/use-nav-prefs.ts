"use client";

import { useCallback, useEffect, useState } from "react";

const FAVORITES_KEY = "qf:favorites";
const RECENTS_KEY = "qf:recents";
const MAX_RECENTS = 6;
const EVENT = "qf:nav-prefs";

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function write(key: string, value: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

/** Record a visited route as "recent" (most-recent-first, capped). Safe to call on every navigation. */
export function recordRecent(href: string) {
  if (!href || href === "/") return;
  const next = [href, ...read(RECENTS_KEY).filter((h) => h !== href)].slice(0, MAX_RECENTS);
  write(RECENTS_KEY, next);
}

/** Reactive favorites + recents (href lists), synced across components via a window event. */
export function useNavPrefs() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => { setFavorites(read(FAVORITES_KEY)); setRecents(read(RECENTS_KEY)); };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);

  const toggleFavorite = useCallback((href: string) => {
    const current = read(FAVORITES_KEY);
    write(FAVORITES_KEY, current.includes(href) ? current.filter((h) => h !== href) : [...current, href]);
  }, []);

  const isFavorite = useCallback((href: string) => favorites.includes(href), [favorites]);

  return { favorites, recents, toggleFavorite, isFavorite };
}
