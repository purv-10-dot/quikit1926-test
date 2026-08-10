// apps/quikcredflow/lib/services/telephony/dedupe.ts
/**
 * IndiaVoice webhook helpers used by the click-to-call pipeline:
 *
 *   - flattenPayload : coerce a vendor body (JSON / urlencoded / Buffer / string
 *                      / object with nested `data`) into Record<string, string>.
 *   - computeDedupeKey : sha256 of the fields that uniquely identify one
 *                        provider event, scoped to a tenant. Drives the
 *                        `(tenantId, processDedupeKey)` upsert that makes
 *                        webhook replays idempotent.
 *   - maskForLog : replace digit runs >=7 with `****<last-4>` for safe logging.
 *
 * `digitsOnly`, `redactUrl`, `maskDigits` are re-exported from sibling modules
 * so callers in this directory have a single import surface.
 */
import crypto from "crypto";

export { digitsOnly, maskDigits } from "@/lib/utils/phone-helpers";
export { redactUrl } from "./india-voice";

type AnyRecord = Record<string, unknown>;

/**
 * Read a vendor field that may arrive under multiple casing/typo variants
 * (e.g. SourceNumber/sourcenumber/source_number, "Destination Numbe").
 */
function pick(flat: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (k in flat && flat[k] != null && flat[k] !== "") return flat[k]!;
  }
  return "";
}

/**
 * Accept whatever the framework hands us — already-parsed JSON object, a raw
 * Buffer, a string, URLSearchParams, or a FormData-flattened object — and
 * return a flat string-only record.
 *
 * Always merges a nested `data: {...}` one level so providers that wrap the
 * call_report inside `{ type, data: {...} }` flatten out.
 */
export function flattenPayload(input: unknown): Record<string, string> {
  let obj: AnyRecord = {};

  if (input == null) {
    return {};
  }
  if (Buffer.isBuffer(input)) {
    obj = parseStringBody(input.toString("utf8"));
  } else if (typeof input === "string") {
    obj = parseStringBody(input);
  } else if (input instanceof URLSearchParams) {
    obj = Object.fromEntries(input.entries());
  } else if (typeof input === "object") {
    obj = input as AnyRecord;
  }

  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "data" && v && typeof v === "object" && !Array.isArray(v)) {
      // Merge nested `data: {...}` one level — child keys win over parents
      // only if the parent didn't already provide a value, matching the
      // legacy NestJS behavior.
      for (const [k2, v2] of Object.entries(v as AnyRecord)) {
        if (v2 != null && result[k2] == null) result[k2] = String(v2);
      }
      continue;
    }
    if (v != null) result[k] = String(v);
  }
  return result;
}

function parseStringBody(text: string): AnyRecord {
  const trimmed = text.trim();
  if (!trimmed) return {};
  // Try JSON first.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? { items: parsed } : (parsed as AnyRecord);
    } catch {
      /* fallthrough to urlencoded */
    }
  }
  // Try urlencoded.
  if (trimmed.includes("=")) {
    try {
      return Object.fromEntries(new URLSearchParams(trimmed).entries());
    } catch {
      /* fallthrough */
    }
  }
  return { raw: trimmed };
}

/**
 * Stable per-event hash so the same provider event always resolves to the
 * same row when upserted into QcfIndiaVoiceWebhookLog. Includes both `CallSid`
 * and `campid` because IndiaVoice uses one or the other depending on the
 * event type — different events about the same call should still each get
 * their own row, but identical replays must collapse.
 */
export function computeDedupeKey(
  orgId: string,
  payload: Record<string, string>,
): string {
  const parts = [
    orgId,
    pick(payload, "CallSid", "callSid", "callsid", "uniqueid"),
    pick(payload, "campid", "Campid", "campId"),
    pick(payload, "Status", "status"),
    pick(payload, "EndTime", "endTime", "end_time"),
    pick(payload, "StartTime", "startTime", "start_time"),
    pick(payload, "CallDuration", "callDuration", "call_duration", "callDurationSec"),
    pick(payload, "TalkDuration", "talkDuration", "talk_duration", "talkDurationSec"),
    pick(payload, "SourceNumber", "sourceNumber", "source_number", "sourcenumber"),
    pick(payload, "DialWhomNumber", "Dial Whom Number", "dialWhomNumber", "dial_whom_number"),
    pick(payload, "CallRecordingUrl", "callRecordingUrl", "call_recording_url"),
  ];
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Replace any run of >=7 consecutive digits with `****<last-4>` so phone
 * numbers and account IDs are unreadable in logs. Distinct from `maskDigits`
 * (which uses a `..` ellipsis) because the spec is explicit about the format.
 */
export function maskForLog(s: string): string {
  if (!s) return "";
  return s.replace(/\d{7,}/g, (m) => `****${m.slice(-4)}`);
}
