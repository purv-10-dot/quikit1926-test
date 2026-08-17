/**
 * Outlook connector — OAuth (Microsoft identity platform) + the two Graph calls
 * QuikFlow needs (/me/sendMail, /me/messages). Plain fetch, no SDK.
 *
 * Env: MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (Azure AD app registration,
 * shared with the Teams calendar connector — see ./teams.ts), MICROSOFT_TENANT_ID
 * (defaults to "common" for multi-tenant + personal accounts).
 * Inbound watermark (`cursor`) = the newest message's receivedDateTime (ISO),
 * used in a `$filter=receivedDateTime gt <ISO>` query.
 */
import type { InboundMail, MailMessage, MailProvider, TokenSet } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["offline_access", "Mail.Send", "Mail.Read", "User.Read"];
const MAX_MESSAGES_PER_POLL = 25;

function tenant(): string {
  return process.env.MICROSOFT_TENANT_ID || "common";
}
function authBase(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`;
}
function clientId(): string {
  const v = process.env.MICROSOFT_CLIENT_ID;
  if (!v) throw new Error("MICROSOFT_CLIENT_ID is not set.");
  return v;
}
function clientSecret(): string {
  const v = process.env.MICROSOFT_CLIENT_SECRET;
  if (!v) throw new Error("MICROSOFT_CLIENT_SECRET is not set.");
  return v;
}

async function tokenRequest(form: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> {
  const res = await fetch(`${authBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = (json.error_description as string) ?? (json.error as string) ?? `HTTP ${res.status}`;
    throw new Error(`Outlook token exchange failed: ${detail}`);
  }
  return json as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

async function fetchEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as { mail?: string; userPrincipalName?: string };
  const email = json.mail ?? json.userPrincipalName;
  if (!res.ok || !email) throw new Error("Could not read Outlook profile address.");
  return email;
}

function toTokenSet(
  raw: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string },
  email: string,
): TokenSet {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000) : null,
    scopes: raw.scope ? raw.scope.split(" ") : SCOPES,
    email,
  };
}

function addressList(recips: { emailAddress?: { address?: string } }[] | undefined): string {
  return (recips ?? []).map((r) => r.emailAddress?.address).filter(Boolean).join(", ");
}

export const OUTLOOK: MailProvider = {
  id: "outlook",
  label: "Outlook",
  scopes: SCOPES,

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
    });
    return `${authBase()}/authorize?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const raw = await tokenRequest({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES.join(" "),
    });
    const email = await fetchEmail(raw.access_token);
    return toTokenSet(raw, email);
  },

  async refresh(refreshToken) {
    const raw = await tokenRequest({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
      scope: SCOPES.join(" "),
    });
    return toTokenSet({ ...raw, refresh_token: raw.refresh_token ?? refreshToken }, "");
  },

  async sendMessage(accessToken, _from, msg) {
    const body = {
      message: {
        subject: msg.subject,
        body: { contentType: msg.html ? "HTML" : "Text", content: msg.body },
        toRecipients: msg.to.split(",").map((a) => ({ emailAddress: { address: a.trim() } })),
        ccRecipients: msg.cc ? msg.cc.split(",").map((a) => ({ emailAddress: { address: a.trim() } })) : [],
        bccRecipients: msg.bcc ? msg.bcc.split(",").map((a) => ({ emailAddress: { address: a.trim() } })) : [],
      },
      saveToSentItems: true,
    };
    const res = await fetch(`${GRAPH}/me/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // sendMail returns 202 Accepted with an empty body (no message id).
    if (res.status !== 202 && !res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Outlook send failed: ${err.error?.message ?? `HTTP ${res.status}`}`);
    }
    return { id: `outlook-${Date.now()}` };
  },

  async listSince(accessToken, cursor) {
    if (!cursor) return { messages: [], nextCursor: new Date().toISOString() };

    const q = new URLSearchParams({
      $filter: `receivedDateTime gt ${cursor}`,
      $orderby: "receivedDateTime desc",
      $top: String(MAX_MESSAGES_PER_POLL),
      $select: "id,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,conversationId,hasAttachments",
    });
    const res = await fetch(`${GRAPH}/me/messages?${q.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      value?: {
        id: string;
        subject?: string;
        from?: { emailAddress?: { address?: string; name?: string } };
        toRecipients?: { emailAddress?: { address?: string } }[];
        ccRecipients?: { emailAddress?: { address?: string } }[];
        bodyPreview?: string;
        receivedDateTime?: string;
        conversationId?: string;
        hasAttachments?: boolean;
      }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(`Outlook list failed: ${json.error?.message ?? `HTTP ${res.status}`}`);

    let maxReceived = cursor;
    const messages: InboundMail[] = (json.value ?? []).map((m) => {
      const received = m.receivedDateTime ?? cursor;
      if (received > maxReceived) maxReceived = received;
      return {
        messageId: m.id,
        threadId: m.conversationId ?? null,
        from: m.from?.emailAddress?.address ?? "",
        fromName: m.from?.emailAddress?.name ?? null,
        to: addressList(m.toRecipients),
        cc: addressList(m.ccRecipients),
        subject: m.subject ?? "",
        snippet: m.bodyPreview ?? "",
        receivedAt: received,
        hasAttachments: m.hasAttachments === true,
      };
    });
    return { messages, nextCursor: maxReceived };
  },
};
