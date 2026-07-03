import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { requirePortalContext } from "@/lib/portal/context";
import { PORTAL_KEYS, type PortalKey } from "@/lib/portal/hosts";

export const dynamic = "force-dynamic";

function resolvePortal(request: NextRequest): PortalKey | null {
  const p = request.nextUrl.searchParams.get("portal") as PortalKey | null;
  return p && PORTAL_KEYS.includes(p) ? p : null;
}

/** Notification center — scoped to the portal user's org + own/broadcast items. */
export async function GET(request: NextRequest) {
  const portal = resolvePortal(request);
  if (!portal) return fail(422, { code: "BAD_PORTAL", message: "Unknown portal." });
  const res = await requirePortalContext(portal);
  if (!res.ok) return fail(res.status, { code: res.code, message: res.message });
  const { orgId, userId } = res.context;

  try {
    const rows = await prisma.$queryRaw`
      SELECT id, title, body, entity_type, read_at, created_at
      FROM notifications
      WHERE org_id = ${orgId}::uuid AND (user_id = ${userId}::uuid OR user_id IS NULL)
      ORDER BY created_at DESC LIMIT 50`;
    const unread = (rows as Array<{ read_at: string | null }>).filter((r) => !r.read_at).length;
    return ok({ notifications: rows, unread });
  } catch (error) {
    return fail(500, { code: "NOTIF_FAILED", message: errorMessage(error) });
  }
}

/** Mark notifications read. Body: { id } or { all: true }. */
export async function POST(request: NextRequest) {
  const portal = resolvePortal(request);
  if (!portal) return fail(422, { code: "BAD_PORTAL", message: "Unknown portal." });
  const res = await requirePortalContext(portal);
  if (!res.ok) return fail(res.status, { code: res.code, message: res.message });
  const { orgId, userId } = res.context;

  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string; all?: boolean };
    if (body.all) {
      await prisma.$executeRaw`UPDATE notifications SET read_at = now() WHERE org_id = ${orgId}::uuid AND (user_id = ${userId}::uuid OR user_id IS NULL) AND read_at IS NULL`;
    } else if (body.id) {
      await prisma.$executeRaw`UPDATE notifications SET read_at = now() WHERE id = ${body.id}::uuid AND org_id = ${orgId}::uuid`;
    } else {
      return fail(422, { code: "MISSING", message: "Provide id or all." });
    }
    return ok({ done: true });
  } catch (error) {
    return fail(500, { code: "NOTIF_READ_FAILED", message: errorMessage(error) });
  }
}
