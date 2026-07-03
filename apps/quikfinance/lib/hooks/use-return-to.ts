"use client";

import { useSearchParams } from "next/navigation";

/**
 * Reads a `?return=` path (set by Combobox "+ New") so an add form can navigate
 * back to where it was opened from. Only same-origin paths are honored.
 */
export function useReturnTo(): string | null {
  const params = useSearchParams();
  const ret = params.get("return");
  return ret && ret.startsWith("/") && !ret.startsWith("//") ? ret : null;
}
