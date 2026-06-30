import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/responses";
import { requirePortalContext } from "@/lib/portal/context";
import { PORTAL_KEYS, type PortalKey } from "@/lib/portal/hosts";

export const dynamic = "force-dynamic";

/** Current user's access to a portal (role, permissions, companies). ?portal=client */
export async function GET(request: NextRequest) {
  const portal = request.nextUrl.searchParams.get("portal") as PortalKey | null;
  if (!portal || !PORTAL_KEYS.includes(portal)) return fail(422, { code: "BAD_PORTAL", message: "Unknown portal." });
  const res = await requirePortalContext(portal);
  if (!res.ok) return fail(res.status, { code: res.code, message: res.message });
  const { userId, role, orgId, contactId, permissions, companies } = res.context;
  return ok({ userId, portal, role, orgId, contactId, permissions, companies });
}
