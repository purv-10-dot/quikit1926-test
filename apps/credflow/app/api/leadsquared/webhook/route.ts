/**
 * Inbound LeadSquared webhook: LeadSquared -> QuikCRM.
 *
 * Not authenticated by the user JWT — it's a server-to-server callback secured
 * by a shared secret (mirrors the telephony webhook). Single-client: the tenant
 * is resolved from env, never from the payload.
 *
 * Contract required by LeadSquared:
 *   - MUST return HTTP 200 for the empty/verification request sent at
 *     registration time (handled BEFORE the secret check).
 *   - MUST return 200 fast and not fail on transient processing errors —
 *     LeadSquared auto-disables a webhook after 10 consecutive non-200s. So we
 *     offload to BullMQ when Redis is available, and when it isn't we process
 *     inline but still return 200 on a processing error (logged loudly).
 *
 * Heavy logic lives in lib/services/leadsquared/inbound.ts.
 *
 * `dynamic = "force-dynamic"` so the raw body + headers reach the handler.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isRedisEnabled } from "@/lib/db/redis";
import { enqueueLeadSquaredInboundSafe } from "@/lib/queue/leadsquared-inbound-queue";
import { checkRateLimit } from "@/lib/services/leadsquared/rate-limit";
import { getResolvedFieldMap } from "@/lib/services/leadsquared/field-map-resolver";
import {
  assertInboundSecret,
  isEmptyWebhookPayload,
  processInboundBatch,
  resolveInboundTenantId,
} from "@/lib/services/leadsquared/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reject obviously-oversized bodies before we buffer/parse them (DoS guard). */
const MAX_BODY_BYTES = Number(process.env.LEADSQUARED_WEBHOOK_MAX_BYTES) || 1_000_000;
const RATE_LIMIT = Number(process.env.LEADSQUARED_WEBHOOK_RATE_LIMIT) || 600;
const RATE_WINDOW_SEC = Number(process.env.LEADSQUARED_WEBHOOK_RATE_WINDOW_SEC) || 60;

async function readBody(req: NextRequest): Promise<unknown> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return req.json().catch(() => ({}));
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : v.name;
    return out;
  }
  // Vendor may post JSON as text/plain; try JSON, else empty.
  return req.json().catch(() => ({}));
}

async function handle(req: NextRequest): Promise<NextResponse> {
  // 0. Size guard — reject oversized bodies before buffering/parsing.
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  const body = req.method === "GET" ? {} : await readBody(req);

  // 1. Empty / verification request → 200 immediately, no secret, no work.
  if (isEmptyWebhookPayload(body)) {
    return NextResponse.json({ ok: true, verification: true });
  }

  // 2. Secret validation (security boundary — a bad secret DOES get a non-200).
  try {
    assertInboundSecret(
      {
        authorization: req.headers.get("authorization"),
        xWebhookSecret: req.headers.get("x-webhook-secret"),
      },
      body as Record<string, unknown>,
    );
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    const status = err?.statusCode ?? 401;
    return NextResponse.json({ ok: false, error: err?.message ?? "Unauthorized" }, { status });
  }

  // 3. Resolve tenant from env (single client).
  const tenantId = resolveInboundTenantId();

  // 4. Rate limit (best-effort; no-op/ fail-open without Redis). Keyed per
  //    tenant. Generous default so normal LeadSquared volume never trips it.
  const rl = await checkRateLimit(`leadsquared-webhook:${tenantId}`, {
    limit: RATE_LIMIT,
    windowSec: RATE_WINDOW_SEC,
  });
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // 5. Offload if Redis is available; otherwise process inline.
  if (isRedisEnabled()) {
    await enqueueLeadSquaredInboundSafe({ tenantId, payload: body });
    return NextResponse.json({ ok: true, queued: true });
  }

  // Inline fallback (Redis disabled). Return 200 even on a processing error so
  // LeadSquared does not auto-disable the webhook; log a REDACTED summary only
  // (never the payload/secret) for operators to act on.
  try {
    const fieldMap = await getResolvedFieldMap();
    const results = await processInboundBatch(tenantId, body, { fieldMap });
    // Single-lead payloads keep the original response shape; batches summarize.
    return NextResponse.json(
      results.length === 1 ? results[0] : { ok: true, batch: true, results },
    );
  } catch (e: unknown) {
    console.error("[leadsquared-webhook] inline processing failed", {
      name: e instanceof Error ? e.name : "unknown",
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "processing_failed" });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

// LeadSquared verifies some webhooks with a GET; always answer 200.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
