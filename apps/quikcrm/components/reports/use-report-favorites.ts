"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "quikcrm.reports.favorites.v1";

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function useReportFavorites() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(readIds());
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: string) => ids.includes(id), [ids]);

  return { favoriteIds: ids, toggle, isFavorite };
}
