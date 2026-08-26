import { prisma } from "@/lib/prisma";
import { isAuthExpiredError } from "@/lib/connectors/errors";

/** Status for a connection whose OAuth grant is dead and must be re-authorised. */
export const EXPIRED = "EXPIRED";

/**
 * Flag a connection whose refresh token Google has rejected.
 *
 * WHY. `invalid_grant` is terminal — the refresh token was revoked, expired
 * (apps still in Google's "Testing" publishing mode expire them after 7 days),
 * or the user withdrew consent. Retrying can never succeed, so leaving the row
 * as CONNECTED means every page load re-attempts a doomed refresh and the user
 * is never told why their data stopped updating.
 *
 * /api/connections reports `connected: conn.status === "CONNECTED"`, so writing
 * anything else here surfaces the platform as disconnected in Integrations and
 * gives the user the reconnect button — no UI change needed.
 *
 * Best-effort: a failure to record this must never turn a degraded page into a
 * broken one.
 */
export async function markConnectionExpired(
  userId: string,
  platform: string,
  workspaceId?: string,
): Promise<void> {
  try {
    await prisma.platformConnection.updateMany({
      where: { userId, platform, ...(workspaceId ? { workspaceId } : {}) },
      data: { status: EXPIRED },
    });
    console.warn(`[reauth] ${platform} marked ${EXPIRED} for user ${userId} — reconnect required`);
  } catch {
    /* best-effort */
  }
}

/** Marks the connection when — and only when — the grant is genuinely dead. */
export async function markExpiredIfAuthError(
  err: unknown,
  userId: string,
  platform: string,
  workspaceId?: string,
): Promise<void> {
  if (isAuthExpiredError(err)) {
    await markConnectionExpired(userId, platform, workspaceId);
  }
}
