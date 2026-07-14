"use client";

import { Segmented } from "@/components/ui";
import type { ThemePref } from "@/lib/shared";
import { useTheme } from "@/app/providers";

const OPTIONS: { label: string; value: ThemePref }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

/** System/Light/Dark control bound to the per-user theme pref (S14b). */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <Segmented label="Theme" options={OPTIONS} value={theme} onChange={(v) => setTheme(v)} />;
}
