// apps/credflow/lib/services/telephony/webhook-handler.ts
/**
 * IndiaVoice webhook pipeline.
 *
 *   1. Secret validation (mandatory in prod or when WEBHOOK_REQUIRE_SECRET=true)
 *   2. Resolve orgId (env override → payload → DEFAULT_ORG_ID → ?orgId=)
 *   3. Idempotent audit row upsert into QcfIndiaVoiceWebhookLog, keyed by
 *      (orgId, processDedupeKey). Replays of the same event return early.
 *   4. Skip mid-call match attempts (transferring/ringing/etc with no terminal
 *      data) so ringing events don't mis-attribute to old call logs.
 *   5. Match a QcfCallLog by providerCallSid/callSid first, then by phone-tail
 *      fallback within a 24h window.
 *   6. Update the matched QcfCallLog with duration/recording/status/etc.
 *   7. Back-link the audit row by setting matchedCallLogId.
 *
 * Mid-call event types that must NEVER match by phone-tail (otherwise an old
 * call log gets a "ringing" status painted onto it):
 *   transferring, ringing, progress, queued, dialing, connecting,
 *   ivr*, call_init, live_call.
 */

import type { Prisma } from "@quikit/database";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db/prisma";
import {
  computeDedupeKey,
  flattenPayload as flattenPayloadInner,
  maskForLog,
} from "./dedupe";

export interface WebhookHeaders {
  authorization?: string | null;
  xWebhookSecret?: string | null;
}

const MID_CALL_EVENT_RE =
  /transferring|ringing|progress|queued|dialing|connecting|ivr|call_init|live_call/i;

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function statusError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function sanitizeOrgId(raw: string): string {
  return raw.split(/[?&#]/)[0]!;
}

function extractSecret(
  headers: WebhookHeaders,
  payload: Record<string, string | undefined>,
): string | null {
  if (headers.authorization?.startsWith("Bearer ")) return headers.authorization.slice(7);
  if (headers.xWebhookSecret) return headers.xWebhookSecret;
  if (payload.secret) return String(payload.secret);
  return null;
}

/**
 * Read a vendor field that may arrive under multiple casing/typo variants
 * (e.g. SourceNumber/sourcenumber/source_number, "Destination Numbe").
 */
function pick(flat: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = flat[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

function toIntOrNull(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toDateOrNull(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function lastTen(num: string): string {
  const digits = (num || "").replace(/\D+/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/**
 * Best-effort attribution of who ended the call, based on the provider's
 * Status field on the call_report event. IndiaVoice doesn't tell us which
 * leg disconnected first, so this is a heuristic:
 *
 *   - busy / no_answer / abandonment / cancel / failed → "system"
 *     (the network or the customer's device terminated; no human hung up)
 *   - ANSWER + duration > 0 → "customer"
 *     (call connected and completed naturally; we don't know which side
 *     hung up first but customer is the safer default in dialer-led flows)
 *   - ANSWER + duration 0 → "system" (silent disconnect — likely network)
 *   - anything else → null (let the caller fall back to existing value)
 */
function inferEndedBy(status: string | null, durationSec: number | null | undefined): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (/busy|no_?answer|abandon|cancel|fail/i.test(s)) return "system";
  if (/answer/i.test(s)) {
    return (durationSec ?? 0) > 0 ? "customer" : "system";
  }
  return null;
}

// Re-exported so callers don't need a separate import.
export const flattenPayload = flattenPayloadInner;

export function mergeQueryAndBody(
  query: Record<string, string>,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return { ...query, ...body };
}

interface ResolvedView {
  callSid: string | null;
  campid: string | null;
  sourceNumber: string | null;
  destinationNumber: string | null;
  dialWhomNumber: string | null;
  status: string | null;
  vendorEventType: string | null;
  callDurationSec: number | null;
  talkDurationSec: number | null;
  coins: number | null;
  direction: string | null;
  callRecordingUrl: string | null;
  startTime: Date | null;
  endTime: Date | null;
}

function resolveFields(flat: Record<string, string>): ResolvedView {
  return {
    callSid: pick(flat, "CallSid", "callSid", "callsid", "uniqueid") || null,
    campid: pick(flat, "campid", "Campid", "campId") || null,
    sourceNumber: pick(flat, "SourceNumber", "sourceNumber", "source_number", "sourcenumber", "cli") || null,
    // Vendor sometimes ships the typo "Destination Numbe" — keep that variant.
    destinationNumber:
      pick(flat, "DestinationNumber", "destinationNumber", "destination_number", "Destination Numbe", "calling_party_b") || null,
    dialWhomNumber:
      pick(flat, "DialWhomNumber", "Dial Whom Number", "dialWhomNumber", "dial_whom_number") || null,
    status: pick(flat, "Status", "status") || null,
    vendorEventType: pick(flat, "type", "eventType", "event") || null,
    callDurationSec: toIntOrNull(pick(flat, "CallDuration", "callDuration", "call_duration", "callDurationSec")),
    talkDurationSec: toIntOrNull(pick(flat, "TalkDuration", "talkDuration", "talk_duration", "talkDurationSec")),
    coins: toIntOrNull(pick(flat, "coins", "Coins", "creditsUsed")),
    direction: pick(flat, "Direction", "direction") || null,
    callRecordingUrl:
      pick(
        flat,
        "CallRecordingUrl",
        "callRecordingUrl",
        "call_recording_url",
        "RecordingUrl",
        "recording_url",
        "recordingUrl",
        "RecordingURL",
        "voice_record_url",
        "voiceRecordUrl",
        "file_url",
        "recording",
      ) || null,
    startTime: toDateOrNull(pick(flat, "StartTime", "startTime", "start_time")),
    endTime: toDateOrNull(pick(flat, "EndTime", "endTime", "end_time")),
  };
}

/**
 * Pure pipeline — assumes secret + tenant have already been resolved.
 * Returns the audit row id, the matched call_log id (if any), and a flag
 * indicating whether a mid-call event was deliberately skipped from matching.
 */
export async function processIndiaVoiceWebhook(
  orgId: string,
  flat: Record<string, string>,
): Promise<{
  ok: true;
  orgId: string;
  auditId: string;
  callLogId: string | null;
  matched: boolean;
  skipped: boolean;
  duplicate: boolean;
}> {
  const r = resolveFields(flat);
  const dedupeKey = computeDedupeKey(orgId, flat);

  // 1. Idempotent audit upsert. We do a findUnique first so we can detect a
  // replay and return early without re-running the (costly) match step.
  const existingAudit = await prisma.qcfIndiaVoiceWebhookLog.findUnique({
    where: { orgId_processDedupeKey: { orgId, processDedupeKey: dedupeKey } },
  });
  if (existingAudit) {
    console.log(
      `[india-voice-webhook] duplicate replay (dedupeKey hit) tenant=${orgId} sid=${maskForLog(
        r.callSid || r.campid || "",
      )} audit=${existingAudit.id}`,
    );
    return {
      ok: true,
      orgId,
      auditId: existingAudit.id,
      callLogId: existingAudit.matchedCallLogId,
      matched: !!existingAudit.matchedCallLogId,
      skipped: false,
      duplicate: true,
    };
  }

  const audit = await prisma.qcfIndiaVoiceWebhookLog.create({
    data: {
      orgId,
      callSid: r.callSid,
      campid: r.campid,
      vendorEventType: r.vendorEventType,
      sourceNumber: r.sourceNumber,
      destinationNumber: r.destinationNumber,
      dialWhomNumber: r.dialWhomNumber,
      status: r.status,
      callDurationSec: r.callDurationSec,
      talkDurationSec: r.talkDurationSec,
      coins: r.coins,
      direction: r.direction,
      callRecordingUrl: r.callRecordingUrl,
      startTime: r.startTime,
      endTime: r.endTime,
      rawPayload: flat as unknown as Prisma.InputJsonValue,
      processDedupeKey: dedupeKey,
    },
  });

  // 2. Skip mid-call match — these events arrive in bulk during the call setup
  // and have no terminal data, so any phone-tail match would mis-attribute to
  // an unrelated old call.
  const isMidCall =
    !r.endTime &&
    !r.callRecordingUrl &&
    (r.callDurationSec ?? 0) === 0 &&
    !!r.vendorEventType &&
    MID_CALL_EVENT_RE.test(r.vendorEventType);
  if (isMidCall) {
    console.log(
      `[india-voice-webhook] mid-call event, skipping match: type=${r.vendorEventType} sid=${maskForLog(
        r.callSid || r.campid || "",
      )} audit=${audit.id}`,
    );
    return { ok: true, orgId, auditId: audit.id, callLogId: null, matched: false, skipped: true, duplicate: false };
  }

  // 3. Primary match — within 24h, by providerCallSid OR legacy callSid.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const idCandidates: string[] = [];
  if (r.callSid) idCandidates.push(r.callSid);
  if (r.campid) idCandidates.push(r.campid);

  console.log(
    `[india-voice-webhook] match-debug idCandidates=${JSON.stringify(idCandidates)} recordingUrl=${r.callRecordingUrl ? "[set]" : "null"} src=${maskForLog(r.sourceNumber || "")} dialWhom=${maskForLog(r.dialWhomNumber || "")}`,
  );

  let callLog =
    idCandidates.length > 0
      ? await prisma.qcfCallLog.findFirst({
          where: {
            orgId,
            createdAt: { gte: since },
            OR: [
              { providerCallSid: { in: idCandidates } },
              { callSid: { in: idCandidates } },
            ],
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

  // 3b. Retry without the 24h window — handles clock skew or cases where
  // the stub row was created before the window boundary.
  if (!callLog && idCandidates.length > 0) {
    callLog = await prisma.qcfCallLog.findFirst({
      where: {
        orgId,
        OR: [
          { providerCallSid: { in: idCandidates } },
          { callSid: { in: idCandidates } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    if (callLog) {
      console.log(
        `[india-voice-webhook] matched via extended window (no 24h) id=${callLog.id} sid=${maskForLog(r.callSid || r.campid || "")}`,
      );
    }
  }

  // 4. Fallback match — last 10 digits of source/dialWhom against either leg.
  if (!callLog) {
    const tail = lastTen(r.sourceNumber || r.dialWhomNumber || "");
    if (tail) {
      callLog = await prisma.qcfCallLog.findFirst({
        where: {
          orgId,
          createdAt: { gte: since },
          OR: [
            { destinationNumber: { endsWith: tail } },
            { sourceNumber: { endsWith: tail } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
    }
  }

  // 5. Update the matched call_log + back-link the audit row.
  let callLogId: string | null = null;
  if (callLog) {
    const inferredEndedBy = inferEndedBy(r.status, r.callDurationSec ?? r.talkDurationSec);
    const updated = await prisma.qcfCallLog.update({
      where: { id: callLog.id },
      data: {
        durationSec: r.callDurationSec ?? r.talkDurationSec ?? callLog.durationSec ?? null,
        talkSec: r.talkDurationSec ?? callLog.talkSec ?? null,
        recordingUrl: r.callRecordingUrl || callLog.recordingUrl || null,
        webhookStatus: r.status || callLog.webhookStatus || null,
        direction: r.direction || callLog.direction || null,
        providerCallSid: callLog.providerCallSid || r.callSid || r.campid || null,
        // Backfill the agent-side leg from dialWhomNumber on outbound events
        // when the stub didn't capture it.
        sourceNumber: callLog.sourceNumber || r.dialWhomNumber || null,
        endTime: r.endTime ?? callLog.endTime ?? null,
        startTime: r.startTime ?? callLog.startTime ?? null,
        // Don't clobber an explicit "agent" set by the End-call button — the
        // user clicked first, that wins. Otherwise let the inference run.
        endedBy: callLog.endedBy === "agent" ? "agent" : inferredEndedBy ?? callLog.endedBy ?? null,
      },
    });
    callLogId = updated.id;
    await prisma.qcfIndiaVoiceWebhookLog.update({
      where: { id: audit.id },
      data: { matchedCallLogId: updated.id },
    });
    console.log(
      `[india-voice-webhook] matched call_log ${updated.id} sid=${maskForLog(
        r.callSid || r.campid || "",
      )}`,
    );
  } else {
    console.log(
      `[india-voice-webhook] no call_log match (will backfill via createCallLog) sid=${maskForLog(
        r.callSid || r.campid || "",
      )} audit=${audit.id}`,
    );
  }

  return {
    ok: true,
    orgId,
    auditId: audit.id,
    callLogId,
    matched: !!callLog,
    skipped: false,
    duplicate: false,
  };
}

/**
 * Full handler — secret validation + tenant resolution + processing.
 * Both `/api/telephony/webhook` and `/api/telephony/india-voice/webhook` use
 * this so the secret/tenant logic stays in one place.
 */
export async function handleWebhook(opts: {
  query: Record<string, string>;
  body: unknown;
  headers: WebhookHeaders;
}) {
  const e = env();
  const flat = flattenPayloadInner(opts.body);
  // Query params win when keys collide so an explicit ?status=foo overrides
  // the body — useful for vendor retry quirks.
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v != null && v !== "") flat[k] = v;
  }

  // 1. Secret validation
  const requireSecret = e.WEBHOOK_REQUIRE_SECRET === "true" || isProd();
  const configuredSecret = e.RP_DIGITAL_WEBHOOK_SECRET;
  if (!configuredSecret && requireSecret) {
    // The provider could send a perfectly valid event but without a server-side
    // secret to compare against we cannot trust the payload — fail closed.
    throw statusError("Webhook secret not configured on server", 503);
  }
  if (configuredSecret) {
    const presented = extractSecret(opts.headers, flat);
    if (!presented) throw statusError("Webhook secret required", 400);
    if (presented !== configuredSecret) throw statusError("Invalid webhook secret", 400);
  }

  // 2. Tenant resolution (env override → payload → DEFAULT_ORG_ID → query)
  let orgId = e.WEBHOOK_DEFAULT_ORG_ID || "";
  if (!orgId && e.WEBHOOK_TRUST_PAYLOAD_ORG_ID !== "false" && e.WEBHOOK_TRUST_PAYLOAD_ORG_ID !== "0") {
    // `flat.*` keys come off the provider's inbound payload — that is an
    // external wire contract, so keep accepting the legacy `tenantId` spelling
    // alongside `orgId`/`org_id`. Only our own variable is renamed.
    orgId = String(flat.tenantId || flat.orgId || flat.org_id || "");
  }
  if (!orgId) orgId = e.DEFAULT_ORG_ID;
  if (!orgId) orgId = String(flat.tenantId || flat.orgId || "");
  if (!orgId) throw statusError("Could not resolve orgId for webhook", 400);
  orgId = sanitizeOrgId(orgId);

  console.log(
    `[india-voice-webhook] → tenant=${orgId} type=${flat.type ?? flat.eventType ?? "?"} sid=${maskForLog(
      flat.CallSid || flat.callSid || flat.campid || "",
    )}`,
  );

  return processIndiaVoiceWebhook(orgId, flat);
}
