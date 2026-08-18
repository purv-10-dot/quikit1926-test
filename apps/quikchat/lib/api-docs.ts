import openapiYaml from "@/docs/openapi.yaml";

/**
 * Shared bits for the in-app API reference at `/api-docs`.
 *
 * The spec is a build-time INLINE, not a runtime file read — see the webpack
 * `asset/source` rule in next.config.js for why (short version: `docs/` is not
 * copied into the standalone Docker image, so `fs.readFile` works in dev and
 * 500s in production).
 */

/** Raw contents of docs/openapi.yaml, inlined into the bundle at build time. */
export const OPENAPI_YAML: string = openapiYaml;

/** Path the viewer fetches the spec from. Same-origin by construction. */
export const SPEC_PATH = "/api-docs/spec";

/**
 * Ops kill switch. `/api-docs` is gated on an authenticated user who holds
 * QuikChat app access, which is the intended tier — but `NODE_ENV` is useless
 * for telling UAT from production here (apps/quikchat/Dockerfile sets
 * NODE_ENV=production for both), so this env var is the only way to turn the
 * page off in one environment and leave it on in another.
 *
 * Default is ON. Set `QUIKCHAT_API_DOCS=off` (or `0` / `false`) to make both
 * the page and the spec route 404.
 */
export function apiDocsEnabled(
  // Next redeclares NodeJS.ProcessEnv as `{ readonly NODE_ENV }` with no index
  // signature (next/types/global.d.ts), so `process.env` doesn't structurally
  // match an env-shaped record without this cast.
  env: { QUIKCHAT_API_DOCS?: string } = process.env as { QUIKCHAT_API_DOCS?: string },
): boolean {
  const raw = (env.QUIKCHAT_API_DOCS ?? "").trim().toLowerCase();
  return raw !== "off" && raw !== "0" && raw !== "false";
}
