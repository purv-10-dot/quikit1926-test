import type { CSSProperties } from "react";

/**
 * Default accent (#6D5DF6, purple/indigo) for the Recruitment Dashboard and
 * My Home tabs, per the enterprise-analytics redesign brief.
 *
 * quikhrms doesn't mount <ThemeApplier /> anywhere yet, so the shared
 * `accent-*` Tailwind classes (from @quikit/ui/tailwind-config) currently
 * fall back to their own static default (blue, #2563eb) everywhere in this
 * app. Scoping these CSS custom properties to just these two tabs' root
 * element — rather than mounting ThemeApplier app-wide — keeps the accent
 * change confined to Dashboard/My Home, as agreed, instead of silently
 * recoloring every other module's buttons/badges/focus rings.
 * If quikhrms enables org-wide theming later, that takes over everywhere
 * ThemeApplier reaches except inside this subtree, where it still wins —
 * an acceptable, easily-removed override at that point.
 *
 * Shade formula matches packages/ui/components/theme-applier.tsx exactly,
 * computed once here for #6D5DF6 (h=246, s=89%, l=66%).
 */
export const recruitAccentStyle: CSSProperties = {
  ["--accent-color" as string]: "#6D5DF6",
  ["--accent-50" as string]: "hsl(246, 100%, 97%)",
  ["--accent-100" as string]: "hsl(246, 99%, 94%)",
  ["--accent-200" as string]: "hsl(246, 89%, 86%)",
  ["--accent-300" as string]: "hsl(246, 89%, 76%)",
  ["--accent-400" as string]: "hsl(246, 89%, 62%)",
  ["--accent-500" as string]: "hsl(246, 89%, 50%)",
  ["--accent-600" as string]: "hsl(246, 89%, 42%)",
  ["--accent-700" as string]: "hsl(246, 99%, 32%)",
  ["--accent-800" as string]: "hsl(246, 100%, 22%)",
  ["--accent-900" as string]: "hsl(246, 100%, 15%)",
};
