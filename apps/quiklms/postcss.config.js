/**
 * PostCSS config (CommonJS) — matches every other app in the monorepo
 * (apps/admin, apps/auth, apps/quikit, … all use `postcss.config.js`).
 *
 * Was previously `postcss.config.mjs`; quiklms was the only app using the ESM
 * form. Both work locally, but keeping the CJS form here removes the odd-one-out
 * and matches the apps that have always deployed cleanly.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
