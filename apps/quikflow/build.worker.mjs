import { build } from "esbuild";

/**
 * Production build for the QuikFlow execution worker (worker/main.ts).
 *
 * Same rationale as services/realtime/build.mjs: `@quikit/database` is a
 * TypeScript workspace package, and the app's own `@/*` sources are resolved
 * via tsconfig path aliases — `node dist/worker.js` can't require any of
 * that directly. So we bundle: `@/*` app sources and `@quikit/*` workspace
 * sources are inlined, every npm dependency stays external (resolved from
 * node_modules at runtime, including the native @prisma/client engine). No
 * tsx at runtime.
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
  tsconfig: "tsconfig.json",
  plugins: [
    {
      name: "externalize-npm-deps",
      setup(b) {
        // Bare imports are external EXCEPT our workspace `@quikit/*` packages,
        // whose `.ts` sources must be bundled (node can't require them).
        // `@/*` app-local imports are resolved via tsconfig paths and bundled.
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@quikit/")) return undefined;
          if (args.path.startsWith("@/")) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
