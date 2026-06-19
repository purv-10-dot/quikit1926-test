"use client";

import { useEffect, useState } from "react";

/**
 * Debounces any value. Useful for search inputs that drive `useQuery`.
 *
 *   const [search, setSearch] = useState("");
 *   const debounced = useDebounced(search, 300);
 *   useQuery({ queryKey: ["employees", debounced], queryFn: ... });
 *
 * Keystrokes fire local state changes immediately (input stays responsive) but
 * the query key only updates after `delay` ms of no further changes — so the
 * server sees one request per pause, not one per keystroke.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
