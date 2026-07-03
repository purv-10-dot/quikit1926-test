"use client";

import { useState, useEffect, type ComponentProps } from "react";
import { ResponsiveContainer } from "recharts";

/**
 * recharts' ResponsiveContainer measures the DOM, so it renders nothing on the
 * server and the chart on the client — a React hydration mismatch. This wrapper
 * renders it only after mount; server + first client render both produce an
 * empty box (the parent supplies the fixed height), so they match.
 */
export function ClientResponsiveContainer(props: ComponentProps<typeof ResponsiveContainer>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <ResponsiveContainer {...props} />;
}
