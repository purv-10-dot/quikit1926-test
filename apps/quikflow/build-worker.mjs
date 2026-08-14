import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

function resolveAppAlias(rel) {
  const base = path.join(appDir, rel);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return base;
}

/**
 * Production build for the QuikFlow execution worker (standalone BullMQ
 * consumer, not the Next.js app). Mirrors services/realtime/build.mjs:
 * workspace `@quikit/*` sources are inlined (node can't require .ts), every
 * npm dependency stays external (resolved from node_modules at runtime,
 * including the native @prisma/client engine).
 */
await build({
  entryPoints: ["worker/main.ts"],
  outfile: "dist/worker.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  plugins: [
    {
      name: "externalize-npm-deps",
      setup(b) {
        // "@/*" is this app's own tsconfig path alias (maps to the app root)
        // — resolve it to a real file, don't treat it as an npm package.
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: resolveAppAlias(args.path.slice(2)),
        }));
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@quikit/")) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
