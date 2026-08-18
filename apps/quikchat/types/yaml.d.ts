/**
 * `.yaml` imports resolve to the file's raw text.
 *
 * Backed by the `asset/source` webpack rule in next.config.js (app build) and
 * by the `yaml-raw` plugin in vitest.config.ts (tests). Both hand back the same
 * thing — the file contents as a string — so `docs/openapi.yaml` is inlined at
 * build time rather than read from disk at runtime, which is what lets it
 * survive the standalone Docker output.
 */
declare module "*.yaml" {
  const contents: string;
  export default contents;
}

declare module "*.yml" {
  const contents: string;
  export default contents;
}
