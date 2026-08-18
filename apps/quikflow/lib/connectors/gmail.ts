/**
 * Gmail connector — OAuth + the two Gmail REST calls QuikFlow needs
 * (users.messages.send, users.messages.list/get). No `googleapis` dependency:
 * everything is a plain fetch, matching the lean engine.
 *
 * Env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (OAuth 2.0 Web client).
 * Inbound watermark (`cursor`) = the newest message's internalDate in epoch
 * SECONDS, which Gmail search accepts directly via `after:<unix>`.
 */
import type { InboundMail, MailMessage, MailProvider, TokenSet } from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** gmail.send is Sensitive; gmail.readonly is Restricted (Testing mode skips verification). */
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];
const MAX_MESSAGES_PER_POLL = 25;

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not set.");
  return v;
}
function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set.");
  return v;
}

/** POST application/x-www-form-urlencoded to Google's token endpoint. */
async function tokenRequest(form: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = (json.error_description as string) ?? (json.error as string) ?? `HTTP ${res.status}`;
    throw new Error(`Gmail token exchange failed: ${detail}`);
  }
  return json as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

/** GET the connected mailbox address. */
async function fetchEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as { emailAddress?: string };
  if (!res.ok || !json.emailAddress) throw new Error("Could not read Gmail profile address.");
  return json.emailAddress;
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

/** RFC-2822 → base64url, the shape Gmail's send endpoint wants in `raw`. */
function encodeMessage(from: string, msg: MailMessage): string {
  const lines = [`From: ${from}`, `To: ${msg.to}`];
  if (msg.cc) lines.push(`Cc: ${msg.cc}`);
  if (msg.bcc) lines.push(`Bcc: ${msg.bcc}`);
  lines.push(`Subject: ${msg.subject}`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: text/${msg.html ? "html" : "plain"}; charset="UTF-8"`);
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(msg.body);
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function headerMap(headers: { name: string; value: string }[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) out[h.name.toLowerCase()] = h.value;
  return out;
}

/** Split "Display Name <addr@x>" into { name, email }. */
function parseAddress(raw: string): { name: string | null; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1]?.replace(/^"|"$/g, "") || null, email: m[2].trim() };
  return { name: null, email: raw.trim() };
}

export const GMAIL: MailProvider = {
  id: "gmail",
  label: "Gmail",
  scopes: SCOPES,

  buildAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline", // ask for a refresh token
      prompt: "consent", // force re-consent so a refresh token is always returned
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const raw = await tokenRequest({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
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
    });
    // Google omits the email on refresh; the caller keeps the stored label.
    return toTokenSet({ ...raw, refresh_token: raw.refresh_token ?? refreshToken }, "");
  },

  async sendMessage(accessToken, from, msg) {
    const res = await fetch(`${API}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encodeMessage(from, msg) }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) throw new Error(`Gmail send failed: ${json.error?.message ?? `HTTP ${res.status}`}`);
    return { id: json.id };
  },

  async listSince(accessToken, cursor) {
    // First poll: don't backfill — start the watermark at "now".
    if (!cursor) return { messages: [], nextCursor: String(Math.floor(Date.now() / 1000)) };

    const q = new URLSearchParams({
      q: `after:${cursor}`,
      maxResults: String(MAX_MESSAGES_PER_POLL),
    });
    const listRes = await fetch(`${API}/messages?${q.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const list = (await listRes.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!listRes.ok) throw new Error(`Gmail list failed: ${list.error?.message ?? `HTTP ${listRes.status}`}`);

    const messages: InboundMail[] = [];
    let maxInternal = Number(cursor);
    for (const ref of list.messages ?? []) {
      const metaRes = await fetch(
        `${API}/messages/${ref.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!metaRes.ok) continue;
      const m = (await metaRes.json()) as {
        id: string;
        threadId?: string;
        snippet?: string;
        internalDate?: string;
        labelIds?: string[];
        payload?: { headers?: { name: string; value: string }[] };
      };
      const h = headerMap(m.payload?.headers);
      const fromParsed = parseAddress(h.from ?? "");
      const internalSec = m.internalDate ? Math.floor(Number(m.internalDate) / 1000) : Number(cursor);
      if (internalSec > maxInternal) maxInternal = internalSec;
      messages.push({
        messageId: m.id,
        threadId: m.threadId ?? null,
        from: fromParsed.email,
        fromName: fromParsed.name,
        to: h.to ?? "",
        cc: h.cc ?? "",
        subject: h.subject ?? "",
        snippet: m.snippet ?? "",
        receivedAt: new Date(internalSec * 1000).toISOString(),
        hasAttachments: false,
      });
    }
    // Gmail `after:` is inclusive to the second; advance past the newest so the
    // same message isn't re-listed next poll.
    const nextCursor = messages.length > 0 ? String(maxInternal + 1) : cursor;
    return { messages, nextCursor };
  },
};
