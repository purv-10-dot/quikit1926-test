/**
 * Mailbox connection service — the single place that reads/writes
 * CrmMailboxConnection and guarantees a fresh access token.
 *
 * Every consumer (send route, sync poller, status endpoint, attachment
 * download) goes through `getActiveConnection` + `withFreshToken` so token
 * refresh + encryption live in exactly one place. All queries are orgId-scoped
 * AND userId-scoped so a user can only ever touch their own mailbox.
 */

import { prisma } from "@/lib/db/prisma";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { getProvider } from "./providers";
import type { ProviderContext } from "./providers/types";
import type { CrmMailboxConnection } from "@quikit/database";

/** Refresh when the token expires within this window. */
const REFRESH_SKEW_MS = 60_000;

export class MailboxError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** The current user's connection (any status), scoped to their org + id. */
export async function getConnection(
  orgId: string,
  userId: string,
): Promise<CrmMailboxConnection | null> {
  return prisma.crmMailboxConnection.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
}

/** The current user's connection, requiring it be active. Throws otherwise. */
export async function getActiveConnection(
  orgId: string,
  userId: string,
): Promise<CrmMailboxConnection> {
  const conn = await getConnection(orgId, userId);
  if (!conn || conn.status === "disconnected") {
    throw new MailboxError("No connected mailbox. Connect one in Settings → Email.", 409);
  }
  return conn;
}

/**
 * Ensure the connection's access token is valid (refreshing + persisting if
 * needed), then run `fn` with a ProviderContext. Refresh failures mark the
 * connection as errored so the UI can prompt a reconnect.
 */
export async function withFreshToken<T>(
  conn: CrmMailboxConnection,
  fn: (ctx: ProviderContext, freshAccessToken: string) => Promise<T>,
): Promise<T> {
  const provider = getProvider(conn.provider);
  let accessToken: string;

  const expiring =
    !conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;

  if (expiring) {
    try {
      const refreshToken = decryptToken(conn.refreshTokenEnc);
      const set = await provider.refreshAccessToken(refreshToken);
      accessToken = set.accessToken;
      await prisma.crmMailboxConnection.update({
        where: { id: conn.id },
        data: {
          accessTokenEnc: encryptToken(set.accessToken),
          ...(set.refreshToken ? { refreshTokenEnc: encryptToken(set.refreshToken) } : {}),
          tokenExpiresAt: set.expiresAt ?? null,
          status: "active",
          lastError: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token refresh failed";
      await prisma.crmMailboxConnection.update({
        where: { id: conn.id },
        data: { status: "error", lastError: `Token refresh failed: ${message}` },
      });
      throw new MailboxError(
        "Mailbox token could not be refreshed — please reconnect in Settings → Email.",
        401,
      );
    }
  } else {
    accessToken = decryptToken(conn.accessTokenEnc);
  }

  const ctx: ProviderContext = {
    accessToken,
    emailAddress: conn.emailAddress,
    historyId: conn.historyId,
    deltaLink: conn.deltaLink,
    deltaInbox: conn.deltaInbox,
    deltaSent: conn.deltaSent,
    deltaDrafts: conn.deltaDrafts,
  };
  return fn(ctx, accessToken);
}

/** Upsert a connection after a successful OAuth exchange. */
export async function saveConnection(args: {
  orgId: string;
  userId: string;
  provider: string;
  emailAddress: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: Date;
  scope?: string;
}): Promise<void> {
  const data = {
    provider: args.provider,
    emailAddress: args.emailAddress,
    accessTokenEnc: encryptToken(args.accessToken),
    refreshTokenEnc: encryptToken(args.refreshToken),
    tokenExpiresAt: args.tokenExpiresAt ?? null,
    scope: args.scope ?? null,
    status: "active",
    lastError: null,
  };

  // A connection row is keyed by (orgId, userId) — ONE per user — so reconnecting
  // to a DIFFERENT mailbox reuses the same row id. The mirrored CrmMailboxEmail
  // rows are keyed by that connection id, so if we don't purge them the new
  // mailbox would inherit the previous one's emails (e.g. connect Microsoft
  // after Gmail → the Mailbox page shows leftover Google mail). Detect a switch
  // (different provider OR different address) and clear the mirror + all cursors
  // so we re-baseline cleanly against the newly connected mailbox.
  const existing = await prisma.crmMailboxConnection.findUnique({
    where: { orgId_userId: { orgId: args.orgId, userId: args.userId } },
    select: { id: true, provider: true, emailAddress: true },
  });
  const mailboxChanged =
    !!existing &&
    (existing.provider !== args.provider || existing.emailAddress !== args.emailAddress);

  await prisma.$transaction(async (tx) => {
    const conn = await tx.crmMailboxConnection.upsert({
      where: { orgId_userId: { orgId: args.orgId, userId: args.userId } },
      create: { orgId: args.orgId, userId: args.userId, ...data },
      // Reconnect: reset ALL cursors so we re-baseline against the (possibly new) mailbox.
      update: {
        ...data,
        historyId: null,
        deltaLink: null,
        deltaInbox: null,
        deltaSent: null,
        deltaDrafts: null,
      },
    });
    if (mailboxChanged) {
      await tx.crmMailboxEmail.deleteMany({
        where: { orgId: args.orgId, mailboxConnectionId: conn.id },
      });
    }
  });
}

/** Disconnect: best-effort provider revoke, then blank tokens + mark disconnected. */
export async function disconnect(orgId: string, userId: string): Promise<void> {
  const conn = await getConnection(orgId, userId);
  if (!conn) return;
  try {
    const provider = getProvider(conn.provider);
    await provider.revoke(decryptToken(conn.refreshTokenEnc));
  } catch {
    // best-effort — proceed to clear local tokens regardless
  }
  await prisma.$transaction(async (tx) => {
    await tx.crmMailboxConnection.update({
      where: { id: conn.id },
      data: {
        status: "disconnected",
        accessTokenEnc: "",
        refreshTokenEnc: "",
        tokenExpiresAt: null,
        historyId: null,
        deltaLink: null,
        deltaInbox: null,
        deltaSent: null,
        deltaDrafts: null,
        lastError: null,
      },
    });
    // Drop the local mirror so a later reconnect (to any provider) can't surface
    // stale mail, and the Mailbox page shows nothing while disconnected.
    await tx.crmMailboxEmail.deleteMany({
      where: { orgId, mailboxConnectionId: conn.id },
    });
  });
}
