import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IntegrationRepository } from "@/lib/integrations/repository";
import { decryptSecret } from "@/lib/integrations/secrets";
import { ENTITY_TYPES, type EntityType } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: { connectionId: string } };

/** GET — verification handshake (providers may echo a challenge). */
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("challenge") ?? request.nextUrl.searchParams.get("hub.challenge");
  return challenge ? new NextResponse(challenge, { status: 200 }) : NextResponse.json({ data: { ok: true } });
}

/**
 * POST — real-time event receiver. Unauthenticated (called by the provider), so
 * it is scoped by the unguessable connection id and an optional shared secret
 * (x-webhook-secret). On a valid event it enqueues an incremental sync for the
 * affected entity (or the whole connection) — processed by the background worker.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const connectionId = params.connectionId;

  const connRows = (await prisma.$queryRaw`
    SELECT id, org_id, is_enabled FROM integration_connections WHERE id = ${connectionId}::uuid LIMIT 1
  `) as Array<{ id: string; org_id: string; is_enabled: boolean }>;
  const conn = connRows[0];
  if (!conn) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown connection." } }, { status: 404 });
  if (!conn.is_enabled) return NextResponse.json({ error: { code: "DISABLED", message: "Connection is paused." } }, { status: 409 });

  // Optional secret verification.
  const hookRows = (await prisma.$queryRaw`
    SELECT secret_enc FROM integration_webhooks WHERE connection_id = ${connectionId}::uuid AND is_active = true LIMIT 1
  `) as Array<{ secret_enc: string | null }>;
  const expectedSecret = hookRows[0]?.secret_enc ? decryptSecret(hookRows[0].secret_enc) : null;
  if (expectedSecret) {
    const provided = request.headers.get("x-webhook-secret");
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid webhook secret." } }, { status: 401 });
    }
  }

  let payload: Record<string, unknown> = {};
  try { payload = (await request.json()) as Record<string, unknown>; } catch { /* allow empty/body-less pings */ }

  // Best-effort entity inference from common provider payload shapes.
  const hint = String(payload.entity ?? payload.module ?? payload.resource ?? request.nextUrl.searchParams.get("entity") ?? "").toLowerCase();
  const entity = (ENTITY_TYPES as readonly string[]).find((e) => hint.includes(e.replace(/_/g, ""))) as EntityType | undefined;

  const repo = new IntegrationRepository(prisma, conn.org_id);
  await prisma.$executeRaw`
    INSERT INTO integration_webhooks (org_id, connection_id, event, is_active, last_event_at)
    VALUES (${conn.org_id}::uuid, ${connectionId}::uuid, ${hint || "event"}, true, now())
  `;
  const job = await repo.enqueueJob({ connectionId, type: "sync", entity: entity ?? null, payload: { options: { entities: entity ? [entity] : undefined }, source: "webhook" }, priority: 2 });

  return NextResponse.json({ data: { accepted: true, jobId: job.id, entity: entity ?? "all" } }, { status: 202 });
}
