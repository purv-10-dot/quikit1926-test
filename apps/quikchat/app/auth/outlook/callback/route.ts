import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import {
  handleCallback,
  microsoftConfigFromEnv,
  verifyState,
} from "@/lib/server/calendar/microsoft";

export const dynamic = "force-dynamic";

// GET /auth/outlook/callback?code=&state= — finish the OAuth connect. This path
// matches the redirect URI registered in the Azure app (MICROSOFT_REDIRECT_URI).
// State is HMAC-bound to the user who started the flow (CSRF defense).
export const GET = withOrgAuth(async (req, ctx) => {
  const cfg = microsoftConfigFromEnv();
  if (!cfg) throw new HttpError(400, "Microsoft calendar is not configured");
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const stateUser = verifyState(cfg, state);
  if (!code || stateUser !== ctx.userId) {
    throw new HttpError(400, "Invalid or expired calendar connect request");
  }
  await handleCallback(cfg, ctx.orgId, ctx.userId, code);
  // Bounce back into the app; the settings panel re-reads connection status.
  return new Response(null, {
    status: 302,
    headers: { location: `${url.origin}/?calendar=connected` },
  });
});
