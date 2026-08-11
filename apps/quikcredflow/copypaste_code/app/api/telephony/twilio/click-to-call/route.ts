// apps/quikcrm/app/api/telephony/twilio/click-to-call/route.ts
/**
 * Spec-named alias for POST /api/telephony/call. The legacy frontend (and
 * the click-to-call build prompt) addresses the action as
 * `/api/telephony/twilio/click-to-call` regardless of the actual provider —
 * that's a historical artifact from when this CRM ran on Twilio. Re-export
 * the existing handler so we have a single source of truth.
 */
export { POST } from "../../call/route";

export const runtime = "nodejs";
