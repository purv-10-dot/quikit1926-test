import { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { mcpHandler } from "@/lib/mcp/server";

// A browser-based/Electron MCP client (e.g. Claude Desktop's connector UI)
// calls this endpoint via fetch() from a renderer context, which enforces
// CORS — an OPTIONS preflight with no Access-Control-* headers fails before
// the real POST is ever sent, surfacing to the user as a generic "couldn't
// reach the server" with no further detail. `mcp-session-id` /
// `mcp-protocol-version` are MCP-spec headers some clients set.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, mcp-protocol-version",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const handlePost = withOrgAuth(
  async (ctx, req: NextRequest): Promise<Response> => {
    // withOrgAuth({ allowPat: true }) only ever produces "agent" actorType
    // via a PAT or an OAuth access token — a plain session or API-token
    // caller has none, and this route has no meaning for them. projectId is
    // no longer required here: it's null for a user-scoped PAT or an OAuth
    // token, and a project id only for a legacy project-scoped PAT — all are
    // valid, already-authenticated callers.
    if (ctx.actorType !== "agent") {
      return Response.json(
        { error: "invalid_token" },
        {
          status: 401,
          headers: {
            "www-authenticate": `Bearer error="invalid_token", resource_metadata="${req.nextUrl.origin}/.well-known/oauth-protected-resource"`,
          },
        },
      );
    }
    const authInfo = {
      token: "pat",
      clientId: ctx.userId,
      scopes: [],
      extra: { orgId: ctx.orgId, projectId: ctx.projectId ?? null, userId: ctx.userId, actorType: ctx.actorType },
    };
    return mcpHandler.fetch(req, { authInfo });
  },
  { allowPat: true },
);

export async function POST(req: NextRequest, routeCtx?: { params: Record<string, never> }): Promise<Response> {
  // Wrapping the whole exported handler (rather than adding CORS only inside
  // handlePost's callback) so every exit path gets it — including
  // withOrgAuth's own early 401/429 responses from resolvePatIdentity(),
  // which never reach the callback above.
  return withCors(await handlePost(req, routeCtx));
}
