import { ok } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { listProviderDescriptors } from "@/lib/integrations/registry";
import { isProviderEnabled } from "@/lib/integrations/config";
import { encryptionEnabled } from "@/lib/integrations/secrets";

export const dynamic = "force-dynamic";

/** Provider catalog (registry-driven) + the org's existing connections. */
export async function GET() {
  const guard = await integrationContext("read");
  if (!guard.ok) return guard.response;

  const providers = listProviderDescriptors()
    .filter((p) => isProviderEnabled(p.key))
    .map((p) => ({ ...p, entityCount: p.capabilities.entities.length }));
  const connections = await guard.repo.listConnections();

  return ok({ providers, connections, encryptionEnabled: encryptionEnabled() });
}
