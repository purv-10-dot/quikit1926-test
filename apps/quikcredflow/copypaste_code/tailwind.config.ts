import type { Config } from "tailwindcss";
import baseConfig from "@quikit/ui/tailwind-config";

/**
 * QuikCRM extends the monorepo's shared Tailwind config with the legacy
 * `crm-*` palette + box-shadows + gradients used throughout the ported UI
 * (cards, buttons, table chrome, etc.). These were previously defined in
 * quikcrm-nextjs/tailwind.config.ts.
 */
const config: Config = {
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
      colors: {
        ...((baseConfig.theme?.extend as { colors?: Record<string, unknown> } | undefined)?.colors ?? {}),
        crm: {
          blue: "#2563eb",
          "blue-dark": "#1d4ed8",
          "blue-glow": "#3b82f6",
          "blue-soft": "#eff6ff",
          "blue-muted": "#dbeafe",
          page: "#f1f5f9",
          panel: "#f8fafc",
          surface: "#ffffff",
          border: "#e2e8f0",
          "border-strong": "#cbd5e1",
          text: "#0f172a",
          muted: "#64748b",
          peach: "#fff7ed",
          "peach-active": "#ffedd5",
        },
      },
      boxShadow: {
        "crm-card":
          "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.06)",
        "crm-dropdown": "0 8px 24px rgba(15, 23, 42, 0.10)",
        "crm-modal": "0 20px 48px rgba(15, 23, 42, 0.18)",
      },
      backgroundImage: {
        "crm-brand": "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
        "crm-main-gradient":
          "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #fff7ed 100%)",
        "crm-login-gradient":
          "linear-gradient(135deg, #eff6ff 0%, #f8fafc 50%, #fff7ed 100%)",
      },
    },
  },
};

export default config;
