// apps/quikcrmexpress/app/api/route.ts
/**
 * Short-URL fallback for IndiaVoice. Some panel deployments only accept a
 * webhook URL with no path beyond `/api` — they reject anything deeper. This
 * route re-exports the canonical handlers so `https://host/api` works
 * identically to `https://host/api/telephony/india-voice/webhook`.
 *
 * `runtime` and `dynamic` are declared inline (not re-exported) because
 * Next.js's static analyzer requires those segment-config values to be
 * literal exports in the route file itself — re-exports trigger
 * "Next.js can't recognize the exported `runtime` field" warnings.
 */
export { GET, POST } from "./telephony/india-voice/webhook/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
