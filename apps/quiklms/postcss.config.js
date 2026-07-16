/**
 * PostCSS config (CommonJS).
 *
 * NOTE: this MUST stay `postcss.config.js` with `module.exports` — the previous
 * `postcss.config.mjs` (ESM `export default`) was silently NOT picked up by the
 * Next.js build, so the Tailwind plugin never ran: the `@tailwind` at-rules were
 * dropped as unknown and only the raw `:root` tokens shipped, leaving the app
 * completely unstyled in production. apps/admin uses this same CJS form.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
