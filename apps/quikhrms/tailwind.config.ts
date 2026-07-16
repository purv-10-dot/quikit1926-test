import type { Config } from "tailwindcss";
import baseConfig from "@quikit/ui/tailwind-config";

// House Tailwind v3 setup (matches quikscale/quiktrack/quikinfra): extend the
// shared @quikit/ui base config. HRMS keeps its own design tokens (HiBob-style
// palette in app/globals.css) layered on top so the existing UX is unchanged.
const config = {
  ...baseConfig,
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // HRMS toggles `.dark` on <html> from /settings (see globals.css overrides).
  darkMode: ["class"],
  theme: {
    ...baseConfig.theme,
    extend: {
      ...baseConfig.theme?.extend,
      colors: {
        ...baseConfig.theme?.extend?.colors,
        // Migrated from the v4 `@theme inline` block in app/globals.css.
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        ...baseConfig.theme?.extend?.fontFamily,
        sans: ["var(--font-geist-sans)", "Inter", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      // ── Canonical HRMS type scale (single source of truth) ──
      // Compact enterprise ladder (Linear / Vercel / GitHub density):
      // page-title 16/600 · section 15/600 · card-title 14/600 · table-head 11/600
      // body 14/400 · secondary 13/400 · caption 12/400 · badge 11/600.
      // Titles compacted app-wide to match the Leaves module (16px page titles).
      fontSize: {
        ...baseConfig.theme?.extend?.fontSize,
        "page-title": ["1rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em", fontWeight: "600" }],
        section: ["0.9375rem", { lineHeight: "1.375rem", letterSpacing: "-0.01em", fontWeight: "600" }],
        "card-title": ["0.875rem", { lineHeight: "1.25rem", letterSpacing: "-0.01em", fontWeight: "600" }],
        "table-head": ["0.75rem", { lineHeight: "1rem", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.25rem" }],
        secondary: ["0.8125rem", { lineHeight: "1.125rem" }],
        caption: ["0.75rem", { lineHeight: "1rem" }],
        badge: ["0.6875rem", { lineHeight: "0.875rem", fontWeight: "600" }],
      },
      // ── Compact control + table rhythm (~20-25% shorter than before) ──
      height: {
        control: "38px",   // buttons, inputs, selects, search, date pickers (was 40)
        "icon-btn": "34px", // was 36
        "btn-sm": "30px",   // was 32
        "row-head": "40px", // table header (was 46)
        row: "44px",        // table row (was 52)
      },
      minHeight: {
        control: "38px",
        "row-head": "40px",
        row: "44px",
      },
    },
  },
} satisfies Config;

export default config;
