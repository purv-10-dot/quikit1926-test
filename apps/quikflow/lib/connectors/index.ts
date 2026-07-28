/**
 * Mail-connector facade — the single surface the OAuth routes, the outbound
 * send action, and the inbound poll scan use. It owns the WfConnection store
 * (tokens encrypted via ./crypto), token refresh, and provider resolution, so
 * callers never touch Prisma columns or provider REST directly.
 */
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "./crypto";
import { GMAIL } from "./gmail";
import { OUTLOOK } from "./microsoft";
import type { MailMessage, MailProvider, MailProviderId, TokenSet } from "./types";

export * from "./types";
export { encryptSecret, decryptSecret } from "./crypto";
export { signState, verifyState } from "./state";

const PROVIDERS: Record<string, MailProvider> = { gmail: GMAIL, outlook: OUTLOOK };

/** All mail-provider ids (the WfProvider values QuikFlow polls / sends through). */
export const MAIL_PROVIDER_IDS: MailProviderId[] = ["gmail", "outlook"];

export function getMailProvider(id: string): MailProvider | undefined {
  return PROVIDERS[id];
}

export function isMailProvider(id: string): id is MailProviderId {
  return id in PROVIDERS;
}

/** The OAuth redirect URI for a provider (must match the console registration). */
export function redirectUriFor(provider: string): string {
  const base = process.env.QUIKFLOW_URL ?? "http://localhost:3011";
  return `${base}/api/connections/${provider}/callback`;
}

/** A row from WfConnection with the columns the facade reads. */
interface StoredConnection {
  id: string;
  orgId: string;
  provider: string;
  label: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
}

/** Upsert (org, provider, mailbox) with freshly-encrypted tokens. */
export async function saveMailConnection(
  orgId: string,
  userId: string,
  provider: MailProviderId,
  tokens: TokenSet,
): Promise<{ id: string; label: string }> {
  const encAccess = encryptSecret(tokens.accessToken);
  const encRefresh = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined;
  const row = await db.wfConnection.upsert({
    where: { orgId_provider_label: { orgId, provider, label: tokens.email } },
    create: {
      orgId,
      provider,
      label: tokens.email,
      status: "connected",
      createdBy: userId,
      accessToken: encAccess,
      refreshToken: encRefresh ?? null,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
    },
    update: {
      status: "connected",
      accessToken: encAccess,
      // Keep the existing refresh token if the provider didn't re-issue one.
      ...(encRefresh ? { refreshToken: encRefresh } : {}),
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
    },
    select: { id: true, label: true },
  });
  return row;
}

/* ----------------------------- API-key providers ---------------------------- */
/**
 * Non-OAuth, non-mail providers (Fathom.ai today) authenticate with a single
 * API key. We reuse WfConnection's encrypted columns: `accessToken` holds the
 * encrypted API key, `refreshToken` optionally holds an encrypted webhook
 * signing secret. `expiresAt` stays null (API keys don't expire).
 */
export const FATHOM_PROVIDER_ID = "fathom" as const;

/** Upsert an API-key connection (encrypted at rest). One row per (org, provider, label). */
export async function saveApiKeyConnection(
  orgId: string,
  userId: string,
  provider: string,
  label: string,
  apiKey: string,
  opts?: { webhookSecret?: string },
): Promise<{ id: string; label: string }> {
  const encKey = encryptSecret(apiKey);
  const encWebhook = opts?.webhookSecret ? encryptSecret(opts.webhookSecret) : undefined;
  return db.wfConnection.upsert({
    where: { orgId_provider_label: { orgId, provider: provider as never, label } },
    create: {
      orgId,
      provider: provider as never,
      label,
      status: "connected",
      createdBy: userId,
      accessToken: encKey,
      refreshToken: encWebhook ?? null,
      scopes: [],
      expiresAt: null,
    },
    update: {
      status: "connected",
      accessToken: encKey,
      ...(encWebhook ? { refreshToken: encWebhook } : {}),
    },
    select: { id: true, label: true },
  });
}

/** Decrypt the API key for an org's first connected Fathom account (or null). */
export async function getFathomKey(
  orgId: string,
): Promise<{ id: string; apiKey: string; webhookSecret: string | null } | null> {
  const conn = await db.wfConnection.findFirst({
    where: { orgId, provider: FATHOM_PROVIDER_ID as never, status: "connected" },
    orderBy: { createdAt: "asc" },
    select: { id: true, accessToken: true, refreshToken: true },
  });
  if (!conn?.accessToken) return null;
  return {
    id: conn.id,
    apiKey: decryptSecret(conn.accessToken),
    webhookSecret: conn.refreshToken ? decryptSecret(conn.refreshToken) : null,
  };
}

const EXPIRY_SKEW_MS = 60_000;

/**
 * Return a valid access token for a connection, refreshing (and persisting the
 * new token) when it's within a minute of expiry. Throws if a refresh is needed
 * but no refresh token is stored (user must reconnect).
 */
export async function getFreshAccessToken(conn: StoredConnection): Promise<string> {
  const provider = getMailProvider(conn.provider);
  if (!provider) throw new Error(`Unknown mail provider "${conn.provider}".`);

  const notExpired = conn.expiresAt && conn.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (conn.accessToken && notExpired) return decryptSecret(conn.accessToken);

  if (!conn.refreshToken) throw new Error("Connection has no refresh token — reconnect required.");
  const refreshed = await provider.refresh(decryptSecret(conn.refreshToken));
  await db.wfConnection.update({
    where: { id: conn.id },
    data: {
      status: "connected",
      accessToken: encryptSecret(refreshed.accessToken),
      expiresAt: refreshed.expiresAt,
      ...(refreshed.refreshToken ? { refreshToken: encryptSecret(refreshed.refreshToken) } : {}),
    },
  });
  return refreshed.accessToken;
}

const CONNECTION_SELECT = {
  id: true,
  orgId: true,
  provider: true,
  label: true,
  accessToken: true,
  refreshToken: true,
  expiresAt: true,
} as const;

/**
 * Resolve a comma-separated `to`/`cc` value that may mix real addresses with
 * QuikScale user ids (what `{{trigger.owner}}` resolves to) into a list of email
 * addresses. Entries containing "@" pass through; the rest are looked up in the
 * org's active members. Org-scoped, so a cross-org id never resolves. Unknown
 * ids are dropped.
 */
export async function resolveRecipients(orgId: string, raw: string): Promise<string> {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const emails: string[] = [];
  const ids: string[] = [];
  for (const p of parts) (p.includes("@") ? emails : ids).push(p);

  if (ids.length > 0) {
    const members = await db.orgMember.findMany({
      where: { orgId, userId: { in: ids } },
      select: { userId: true, user: { select: { email: true } } },
    });
    const byId = new Map(members.map((m) => [m.userId, m.user.email]));
    for (const id of ids) {
      const email = byId.get(id);
      if (email) emails.push(email);
    }
  }
  // De-dupe while preserving order.
  return [...new Set(emails)].join(", ");
}

/**
 * Send a message from an org's connected mailbox. `providerHint` pins a provider
 * (gmail.send / outlook.send); when null, the oldest connected mailbox is used
 * (the provider-agnostic email.send). Returns null when the org has no matching
 * connected mailbox, so the action can skip cleanly rather than fail.
 */
export async function sendMailForOrg(
  orgId: string,
  providerHint: MailProviderId | null,
  msg: MailMessage,
  opts?: { connectionId?: string },
): Promise<{ id: string; from: string; provider: string } | null> {
  // Resolve owner/user ids to real addresses before we bother finding a mailbox.
  const to = await resolveRecipients(orgId, msg.to);
  if (!to) throw new Error(`No email address resolved for recipient "${msg.to}"`);
  const cc = msg.cc ? await resolveRecipients(orgId, msg.cc) : undefined;

  const conn = await db.wfConnection.findFirst({
    where: {
      orgId,
      status: "connected",
      // A specific "From account" (the builder's picker) wins; otherwise the
      // provider hint (gmail.send/outlook.send) or the oldest connected mailbox.
      ...(opts?.connectionId
        ? { id: opts.connectionId }
        : { provider: providerHint ? { equals: providerHint } : { in: MAIL_PROVIDER_IDS } }),
    },
    orderBy: { createdAt: "asc" },
    select: CONNECTION_SELECT,
  });
  if (!conn) return null;

  const provider = getMailProvider(conn.provider);
  if (!provider) return null;
  const accessToken = await getFreshAccessToken(conn);
  const sent = await provider.sendMessage(accessToken, conn.label, { ...msg, to, cc: cc || undefined });
  return { id: sent.id, from: conn.label, provider: conn.provider };
}
