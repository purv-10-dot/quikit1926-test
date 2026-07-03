import { fail } from "@/lib/api/responses";
import { requirePortalContext, type PortalContext } from "./context";
import type { PortalKey } from "./hosts";
import { portalCan, type Permission } from "./rbac";

type Guard =
  | { ok: true; context: PortalContext }
  | { ok: false; response: ReturnType<typeof fail> };

/** Resolve portal access for an API route, optionally requiring a permission. */
export async function portalRoute(portal: PortalKey, permission?: Permission): Promise<Guard> {
  const res = await requirePortalContext(portal);
  if (!res.ok) return { ok: false, response: fail(res.status, { code: res.code, message: res.message }) };
  if (permission && !portalCan(portal, res.context.role, permission)) {
    return { ok: false, response: fail(403, { code: "FORBIDDEN", message: "Your role does not permit this action." }) };
  }
  return { ok: true, context: res.context };
}
