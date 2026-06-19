import type { Config } from "tailwindcss";
import baseConfig from "@quikit/ui/tailwind-config";

const config = {
  ...baseConfig,
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    ...baseConfig.theme,
    extend: {
      ...(baseConfig.theme?.extend ?? {}),
      // ── QuikSocial design system tokens ──
      // Values reference CSS custom properties defined in app/globals.css.
      colors: {
        ...((baseConfig.theme?.extend as { colors?: Record<string, unknown> })?.colors ?? {}),
        "qs-glass": "var(--qs-glass-bg)",
        "qs-glass-border": "var(--qs-glass-border)",
        "qs-glass-hover": "var(--qs-glass-bg-hover)",
        "qs-input": "var(--qs-input-bg)",
        "qs-input-border": "var(--qs-input-border)",
        "qs-primary": "var(--qs-text-primary)",
        "qs-secondary": "var(--qs-text-secondary)",
        "qs-muted": "var(--qs-text-muted)",
        "qs-sidebar": "var(--qs-sidebar-bg)",
        "qs-btn-primary": "var(--qs-btn-primary-bg)",
        "qs-btn-primary-text": "var(--qs-btn-primary-text)",
        "qs-btn-secondary": "var(--qs-btn-secondary-bg)",
        "qs-published": "var(--qs-status-published)",
        "qs-review": "var(--qs-status-review)",
        "qs-scheduled": "var(--qs-status-scheduled)",
        "qs-failed": "var(--qs-status-failed)",
        "qs-draft": "var(--qs-status-draft)",
        "qs-overdue": "var(--qs-status-overdue)",
      },
      borderRadius: {
        card: "var(--qs-card-radius)",
        input: "var(--qs-input-radius)",
        btn: "var(--qs-btn-radius)",
      },
      width: { sidebar: "var(--qs-sidebar-width)" },
      backdropBlur: { qs: "12px" },
      backgroundImage: { "qs-tag": "var(--qs-tag-gradient)" },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out both",
        "slide-up": "slide-up 0.22s ease-out both",
      },
    },
  },
} satisfies Config;

export default config;
