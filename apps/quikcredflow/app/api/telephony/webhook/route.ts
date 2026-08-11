// apps/quikcredflow/app/api/telephony/webhook/route.ts
/**
 * Legacy webhook URL — kept so already-configured IndiaVoice panel webhooks
 * keep working. Delegates to the canonical handler at
 * /api/telephony/india-voice/webhook. `runtime` and `dynamic` are declared
 * inline (not re-exported) so Next.js's static analyzer recognizes them.
 */
export { GET, POST } from "../india-voice/webhook/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
