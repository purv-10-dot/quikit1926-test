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
    },
  },
} satisfies Config;

export default config;
