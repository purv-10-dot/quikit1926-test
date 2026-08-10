import type { Config } from "tailwindcss";

// Ported from the QuikInsight UI. The visual design lives in app/globals.css as
// CSS variables + global classes; Tailwind is available for new components and
// maps the same CSS variables into its color palette. See UI_MIGRATION_MANIFEST.md.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        sidebar: "var(--sidebar)",
        border: "var(--border)",
        ink: "var(--ink)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-ink": "var(--accent-ink)",
        green: "var(--green)",
        red: "var(--red)",
      },
    },
  },
  plugins: [],
};
export default config;
