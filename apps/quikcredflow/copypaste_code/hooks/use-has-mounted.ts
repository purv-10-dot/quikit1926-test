"use client";

import { useEffect, useState } from "react";

/** True after the component has mounted on the client (false during SSR + first paint). */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
