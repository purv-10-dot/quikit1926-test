import { isHttpError } from "@/lib/auth-shims";
import * as channels from "@/lib/server/channels.service";

export const dynamic = "force-dynamic";

/**
 * PUBLIC — no withOrgAuth. The invite code is the secret; the landing page must
 * render without a session. We map HttpError to a status manually here since
 * there is no org wrapper to do it.
 */
export async function GET(_req: Request, context: { params: { code: string } }) {
  try {
    return Response.json(await channels.previewInvite(context.params.code));
  } catch (e) {
    if (isHttpError(e)) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
