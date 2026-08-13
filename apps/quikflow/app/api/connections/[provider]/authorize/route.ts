import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getOAuthProvider, isOAuthProvider, redirectUriFor, signState } from "@/lib/connectors";

export const runtime = "nodejs";

type Params = { provider: string };

/**
 * GET /api/connections/:provider/authorize — start the OAuth consent flow for a
 * mail provider (gmail | outlook). Managing org connections is an App Admin
 * capability (PRD FR-F1). We sign { orgId, userId, provider } into `state` so
 * the callback can bind the returned tokens to this org without trusting query
 * params, then redirect the browser to the provider's consent screen.
 */
export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, _req, { params }) => {
    const providerId = params.provider;
    if (!isOAuthProvider(providerId)) {
      return NextResponse.json({ success: false, error: "Unknown provider" }, { status: 400 });
    }
    const provider = getOAuthProvider(providerId)!;
    const base = process.env.QUIKFLOW_URL ?? "http://localhost:3014";
    try {
      const state = signState({ orgId, userId, provider: providerId });
      const url = provider.buildAuthUrl(redirectUriFor(providerId), state);
      return NextResponse.redirect(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "OAuth setup failed";
      return NextResponse.redirect(`${base}/connections?error=${encodeURIComponent(message)}`);
    }
  },
  // Any signed-in org member may connect a mailbox (Zapier/n8n model), not just
  // App Admins. Everything stays org-scoped via withOrgAuth's orgId.
);
