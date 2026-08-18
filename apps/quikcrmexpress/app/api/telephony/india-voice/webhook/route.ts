// apps/quikcrmexpress/app/api/telephony/india-voice/webhook/route.ts
/**
 * Canonical IndiaVoice webhook endpoint. The old /api/telephony/webhook path
 * re-exports these handlers so already-configured panels keep working without
 * changes. The short-URL /api fallback at app/api/route.ts also re-exports
 * these for panels that only accept https://host/api.
 *
 * Both GET and POST are accepted because IndiaVoice's panel sometimes retries
 * with a GET when its POST attempt fails due to firewall idiosyncrasies.
 *
 * `dynamic = "force-dynamic"` opts the route out of Next's static rendering
 * so request headers + body are guaranteed to reach the handler unmodified.
 */
import { NextResponse, type NextRequest } from "next/server";
import { handleWebhook } from "@/lib/services/telephony/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readBody(req: NextRequest): Promise<unknown> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await req.json().catch(() => ({}));
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : v.name;
    return out;
  }
  // Last-ditch: vendor sometimes posts text/plain with a JSON or urlencoded
  // payload. Hand the raw text to flattenPayload, which handles both.
  try {
    return await req.json();
  } catch {
    return await req.text();
  }
}

async function process(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const query = Object.fromEntries(url.searchParams);
    const body = req.method === "GET" ? {} : await readBody(req);
    const result = await handleWebhook({
      query,
      body,
      headers: {
        authorization: req.headers.get("authorization"),
        xWebhookSecret: req.headers.get("x-webhook-secret"),
      },
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    const status = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    if (status >= 500) console.error("[india-voice-webhook]", e);
    return NextResponse.json({ success: false, error: err?.message || "Webhook error" }, { status });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return process(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return process(req);
}
