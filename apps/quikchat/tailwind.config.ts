import type { Config } from "tailwindcss";
import baseConfig from "@quikit/ui/tailwind-config";

/**
 * QuikChat extends the monorepo's shared Tailwind config. App-specific design
 * tokens (if any) are added under theme.extend as the UI lands in later
 * batches; the Batch 1 scaffold keeps the base config plus content globs only.
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
    },
  },
};

export default config;
