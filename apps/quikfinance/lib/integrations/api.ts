import { requireApiContext, type ApiContext } from "@/lib/api/auth";
import { fail } from "@/lib/api/responses";
import { IntegrationRepository } from "./repository";
import { canManageIntegrations, canViewIntegrations, FEATURE_FLAGS } from "./config";

type Ctx = { repo: IntegrationRepository; context: ApiContext };
type Guard = { ok: true; repo: IntegrationRepository; context: ApiContext } | { ok: false; response: ReturnType<typeof fail> };

/** Resolve auth + RBAC + feature flag and hand back an org-scoped repository. */
export async function integrationContext(mode: "read" | "write"): Promise<Guard> {
  if (!FEATURE_FLAGS.integrations) {
    return { ok: false, response: fail(404, { code: "DISABLED", message: "Integrations are not enabled." }) };
  }
  const auth = await requireApiContext();
  if (!auth.ok) return { ok: false, response: fail(auth.status, { code: auth.code, message: auth.message }) };
  const allowed = mode === "write" ? canManageIntegrations(auth.context) : canViewIntegrations(auth.context);
  if (!allowed) {
    return { ok: false, response: fail(403, { code: "FORBIDDEN", message: "You do not have permission to manage integrations." }) };
  }
  const repo = new IntegrationRepository(auth.context.prisma, auth.context.orgId, auth.context.userId);
  return { ok: true, repo, context: auth.context };
}

export type { Ctx };
