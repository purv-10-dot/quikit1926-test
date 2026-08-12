import { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { mcpHandler } from "@/lib/mcp/server";

export const POST = withOrgAuth(
  async (ctx, req: NextRequest): Promise<Response> => {
    // withOrgAuth({ allowPat: true }) only ever produces a projectId +
    // "agent" actorType via a PAT — a plain session or API-token caller
    // has neither, and this route has no meaning for them.
    if (!ctx.projectId || ctx.actorType !== "agent") {
      return Response.json(
        { error: "invalid_token" },
        { status: 401, headers: { "www-authenticate": 'Bearer error="invalid_token"' } },
      );
    }
    const authInfo = {
      token: "pat",
      clientId: ctx.userId,
      scopes: [],
      extra: {
        orgId: ctx.orgId,
        projectId: ctx.projectId,
        userId: ctx.userId,
        actorType: ctx.actorType,
        actingAgentId: ctx.actingAgentId ?? "",
      },
    };
    return mcpHandler.fetch(req, { authInfo });
  },
  { allowPat: true },
);
