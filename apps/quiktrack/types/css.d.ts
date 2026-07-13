// Ambient declarations for CSS side-effect imports (e.g. `import "./globals.css"`).
//
// Under `moduleResolution: "bundler"`, TypeScript 5.x reports TS2882 ("Cannot
// find module or type declarations for side-effect import") for these because
// Next.js only ships typings for CSS *modules* (`*.module.css`), not plain
// global stylesheets. Next bundles the CSS at build time regardless; this file
// exists purely to satisfy the type checker. The more specific `*.module.css`
// declaration from Next still wins for CSS-module imports.
declare module "*.css";
declare module "*.scss";
