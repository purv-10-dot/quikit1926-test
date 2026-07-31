import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  getOAuthProvider,
  isOAuthProvider,
  redirectUriFor,
  saveMailConnection,
  verifyState,
} from "@/lib/connectors";

export const runtime = "nodejs";

type Params = { provider: string };

/**
 * Render the popup result page. When opened in an OAuth popup (Zapier-style), it
 * postMessages the parent window and closes itself; when reached by a full-page
 * redirect (popup blocked), it falls back to navigating back to /connections
 * with a flag. Same-origin postMessage only.
 */
function popupResult(
  base: string,
  result: { status: "connected" | "error"; provider: string; label?: string; error?: string },
): NextResponse {
  const message = JSON.stringify({ type: "quikflow:connection", ...result });
  const fallback =
    result.status === "connected"
      ? `${base}/connections?connected=${encodeURIComponent(result.label ?? "")}`
      : `${base}/connections?error=${encodeURIComponent(result.error ?? "Connection failed")}`;
  const heading =
    result.status === "connected"
      ? `Connected ${result.label ?? ""}. You can close this window.`
      : `Couldn't connect: ${result.error ?? "failed"}`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>QuikFlow — Connecting…</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#374151">
<p style="font-size:14px">${heading}</p>
<script>
(function () {
  var msg = ${message};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(msg, window.location.origin);
      window.close();
      return;
    }
  } catch (e) { /* cross-origin opener — fall through to redirect */ }
  window.location.replace(${JSON.stringify(fallback)});
})();
</script>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * GET /api/connections/:provider/callback — the OAuth redirect target. Verifies
 * the signed `state` (CSRF + org binding), exchanges the code for tokens, and
 * upserts the WfConnection with the tokens encrypted at rest. Returns a
 * self-closing popup page (falls back to a redirect when not in a popup).
 */
export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const providerId = params.provider;
    const base = process.env.QUIKFLOW_URL ?? new URL(req.url).origin;
    const fail = (error: string) => popupResult(base, { status: "error", provider: providerId, error });

    if (!isOAuthProvider(providerId)) return fail("Unknown provider");

    const url = new URL(req.url);
    const oauthError = url.searchParams.get("error");
    if (oauthError) return fail(oauthError);

    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) return fail("Missing authorization code");

    try {
      const state = verifyState(stateRaw);
      if (state.orgId !== orgId || state.provider !== providerId) {
        return fail("OAuth state mismatch");
      }
      const provider = getOAuthProvider(providerId)!;
      const tokens = await provider.exchangeCode(code, redirectUriFor(providerId));
      const saved = await saveMailConnection(orgId, userId, providerId, tokens);
      return popupResult(base, { status: "connected", provider: providerId, label: saved.label });
    } catch (error: unknown) {
      return fail(error instanceof Error ? error.message : "OAuth callback failed");
    }
  },
  // Same as authorize — any signed-in org member may complete the connect.
);
