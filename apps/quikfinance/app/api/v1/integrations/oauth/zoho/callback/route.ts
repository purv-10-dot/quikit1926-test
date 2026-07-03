import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { IntegrationRepository } from "@/lib/integrations/repository";
import { getProvider } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/**
 * Zoho OAuth2 redirect handler. Zoho calls back with ?code & ?state(=connectionId).
 * We exchange the code, persist encrypted tokens, fetch organizations, and bounce
 * the user back into the connection workspace.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const connectionId = url.searchParams.get("state");
  const base = process.env.APP_URL ?? url.origin;
  const redirectTo = (path: string) => NextResponse.redirect(`${base}${path}`);

  if (!code || !connectionId) return redirectTo("/settings/integrations?error=missing_code");

  const auth = await requireApiContext();
  if (!auth.ok) return redirectTo("/login");

  const repo = new IntegrationRepository(auth.context.prisma, auth.context.orgId, auth.context.userId);
  try {
    const ctx = await repo.buildProviderContext(connectionId);
    const conn = await repo.getConnection(connectionId);
    if (!conn) return redirectTo("/settings/integrations?error=not_found");

    const provider = getProvider(conn.provider_key as string, ctx);
    const region = url.searchParams.get("location") || url.searchParams.get("accounts-server")?.split(".").pop();
    if (region) await repo.updateConnection(connectionId, { region });

    const tokens = await provider.authenticate({ code });
    await repo.saveTokens(connectionId, tokens);

    // Discover organizations to populate company selection.
    try {
      const freshCtx = await repo.buildProviderContext(connectionId);
      const meta = await getProvider(conn.provider_key as string, freshCtx).getMetadata();
      const first = meta.organizations[0];
      if (first) await repo.updateConnection(connectionId, { external_org_id: first.id, company_name: first.name });
    } catch {
      // metadata fetch optional
    }

    await repo.updateConnection(connectionId, { status: "connected", last_error: null });
    await repo.notify({ connectionId, type: "connected", title: "Zoho Books connected", body: "Your Zoho Books account is now connected to QuikFinance." });
    return redirectTo(`/settings/integrations/${connectionId}?connected=1`);
  } catch (error) {
    await repo.updateConnection(connectionId, { status: "error", last_error: error instanceof Error ? error.message : "OAuth failed" });
    return redirectTo(`/settings/integrations/${connectionId}?error=oauth_failed`);
  }
}
