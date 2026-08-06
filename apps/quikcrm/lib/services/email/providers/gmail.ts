/**
 * Gmail provider — Gmail REST API v1 + Google OAuth 2.0, over native fetch.
 * No googleapis SDK (app CLAUDE.md: no heavy new deps).
 *
 * Scopes: gmail.send (send), gmail.readonly (sync inbox/sent), plus profile
 * email. access_type=offline + prompt=consent to always get a refresh token.
 */

import { env } from "@/lib/env";
import {
  buildMimeMessage,
  extractBodies,
  extractEmail,
  extractName,
  headerValue,
  splitAddresses,
} from "./mime";
import { providerFetch } from "./http";
import type { MailboxProvider, NormalizedMessage, SyncResult, TokenSet } from "./types";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

function creds() {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured (GOOGLE_CLIENT_ID/SECRET).");
  }
  return { id: e.GOOGLE_CLIENT_ID, secret: e.GOOGLE_CLIENT_SECRET };
}

function parseTokenResponse(json: Record<string, unknown>): TokenSet {
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : undefined;
  return {
    accessToken: String(json.access_token),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

function authHeader(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

export const gmailProvider: MailboxProvider = {
  name: "gmail",

  getAuthUrl({ redirectUri, state }) {
    const { id } = creds();
    const q = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent", // force a refresh_token every time
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH_ENDPOINT}?${q.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const { id, secret } = creds();
    const json = await providerFetch<Record<string, unknown>>(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    return parseTokenResponse(json);
  },

  async refreshAccessToken(refreshToken) {
    const { id, secret } = creds();
    const json = await providerFetch<Record<string, unknown>>(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: id,
        client_secret: secret,
        grant_type: "refresh_token",
      }).toString(),
    });
    const set = parseTokenResponse(json);
    // Google omits refresh_token on refresh — preserve the caller's existing one.
    if (!set.refreshToken) set.refreshToken = refreshToken;
    return set;
  },

  async getProfileEmail(accessToken) {
    const json = await providerFetch<{ emailAddress?: string }>(`${API}/profile`, {
      headers: authHeader(accessToken),
    });
    if (!json.emailAddress) throw new Error("Gmail profile did not return an email address.");
    return json.emailAddress;
  },

  async revoke(token) {
    try {
      await providerFetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
    } catch {
      // best-effort
    }
  },

  async sendMessage(ctx, input) {
    const raw = buildMimeMessage(input);
    const body: Record<string, unknown> = {
      raw: Buffer.from(raw, "utf8").toString("base64url"),
    };
    if (input.providerThreadId) body.threadId = input.providerThreadId;

    const json = await providerFetch<{ id: string; threadId: string }>(`${API}/messages/send`, {
      method: "POST",
      headers: { ...authHeader(ctx.accessToken), "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    // Fetch the RFC Message-ID header for future reply threading.
    let rfcMessageId: string | undefined;
    try {
      const meta = await getMessageMetadata(ctx.accessToken, json.id, ["Message-ID"]);
      rfcMessageId = headerValue(meta.payload?.headers, "Message-ID") ?? undefined;
    } catch {
      // non-fatal
    }
    return { providerMessageId: json.id, providerThreadId: json.threadId, rfcMessageId };
  },

  async fetchNewMessages(ctx, opts) {
    // Incremental path via History API when we have a cursor.
    if (ctx.historyId) {
      try {
        return await historySync(ctx.accessToken, ctx.historyId);
      } catch {
        // 404 = historyId too old; fall through to a bounded re-baseline.
        const reset = await backfillSync(ctx.accessToken, opts.backfillSinceMs);
        return { ...reset, reset: true };
      }
    }
    return backfillSync(ctx.accessToken, opts.backfillSinceMs);
  },

  async backfillMessages(ctx, { sinceMs, cursor }) {
    // Gmail search spans all labels (INBOX + SENT), so one paged query covers
    // both inbox and sent — no per-folder handling needed (unlike Graph).
    const afterEpochSecs = Math.floor(sinceMs / 1000);
    const q = new URLSearchParams({
      q: `after:${afterEpochSecs} -in:chats`,
      maxResults: "50",
    });
    if (cursor) q.set("pageToken", cursor);

    const list = await providerFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `${API}/messages?${q.toString()}`,
      { headers: authHeader(ctx.accessToken) },
    );
    const ids = (list.messages ?? []).map((m) => m.id);
    const messages = await hydrate(ctx.accessToken, ids);
    const done = !list.nextPageToken;
    // Capture the incremental cursor ONLY on the final page, so live sync
    // resumes exactly where the backfill ended.
    const historyId = done ? await getProfileHistoryId(ctx.accessToken) : undefined;
    return { messages, nextCursor: list.nextPageToken, done, historyId };
  },

  async getAttachment(ctx, { providerMessageId, providerAttachmentId }) {
    const json = await providerFetch<{ data?: string; size?: number }>(
      `${API}/messages/${providerMessageId}/attachments/${providerAttachmentId}`,
      { headers: authHeader(ctx.accessToken) },
    );
    // Gmail returns base64url; normalize to standard base64 for download.
    const contentBase64 = json.data
      ? Buffer.from(json.data, "base64url").toString("base64")
      : "";
    return { contentBase64 };
  },
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}
interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

async function getMessageMetadata(
  accessToken: string,
  id: string,
  headers: string[],
): Promise<GmailMessage> {
  const q = new URLSearchParams({ format: "metadata" });
  for (const h of headers) q.append("metadataHeaders", h);
  return providerFetch<GmailMessage>(`${API}/messages/${id}?${q.toString()}`, {
    headers: authHeader(accessToken),
  });
}

async function getFullMessage(accessToken: string, id: string): Promise<GmailMessage> {
  return providerFetch<GmailMessage>(`${API}/messages/${id}?format=full`, {
    headers: authHeader(accessToken),
  });
}

async function getProfileHistoryId(accessToken: string): Promise<string | undefined> {
  const p = await providerFetch<{ historyId?: string }>(`${API}/profile`, {
    headers: authHeader(accessToken),
  });
  return p.historyId;
}

/**
 * Incremental sync using the History API from a known historyId.
 *
 * Listens for BOTH `messageAdded` and `labelAdded`. Mail sent from the Gmail UI
 * frequently does NOT produce a `messageAdded` event: the message already exists
 * in the mailbox (Gmail auto-saves a draft while composing), so the send is
 * recorded as the SENT label being applied to that existing id — a `labelAdded`
 * event. Listening only for `messageAdded` therefore misses Gmail-sent mail
 * entirely, which is why it never reached the CRM. We take the id from any
 * labelAdded whose labelIds include SENT; normalize() re-reads the authoritative
 * label set during hydrate, so a message that has since changed state is still
 * classified correctly.
 *
 * `historyTypes` repeats as a multi-value query param (Gmail ANDs a single value
 * but ORs repeats) — URLSearchParams.append, not set.
 */
async function historySync(accessToken: string, startHistoryId: string): Promise<SyncResult> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let newHistoryId = startHistoryId;

  do {
    const q = new URLSearchParams({ startHistoryId });
    q.append("historyTypes", "messageAdded");
    q.append("historyTypes", "labelAdded");
    if (pageToken) q.set("pageToken", pageToken);
    const page = await providerFetch<{
      history?: {
        messagesAdded?: { message: { id: string } }[];
        labelsAdded?: { message: { id: string }; labelIds?: string[] }[];
      }[];
      historyId?: string;
      nextPageToken?: string;
    }>(`${API}/history?${q.toString()}`, { headers: authHeader(accessToken) });

    for (const h of page.history ?? []) {
      for (const added of h.messagesAdded ?? []) ids.add(added.message.id);
      // Only SENT matters here — ignore READ/STARRED/category churn, which would
      // otherwise re-hydrate half the mailbox on every tick.
      for (const labeled of h.labelsAdded ?? []) {
        if (labeled.labelIds?.includes("SENT")) ids.add(labeled.message.id);
      }
    }
    if (page.historyId) newHistoryId = page.historyId;
    pageToken = page.nextPageToken;
  } while (pageToken);

  const messages = await hydrate(accessToken, [...ids]);
  return { messages, historyId: newHistoryId };
}

/** Bounded initial backfill: recent messages since `sinceMs`. */
async function backfillSync(accessToken: string, sinceMs: number): Promise<SyncResult> {
  const afterEpochSecs = Math.floor(sinceMs / 1000);
  const q = new URLSearchParams({
    q: `after:${afterEpochSecs} -in:chats`,
    maxResults: "100",
  });
  const list = await providerFetch<{ messages?: { id: string }[] }>(
    `${API}/messages?${q.toString()}`,
    { headers: authHeader(accessToken) },
  );
  const ids = (list.messages ?? []).map((m) => m.id);
  const messages = await hydrate(accessToken, ids);
  const historyId = await getProfileHistoryId(accessToken);
  return { messages, historyId };
}

/** Fetch + normalize a batch of message ids (sequential to respect rate limits). */
async function hydrate(accessToken: string, ids: string[]): Promise<NormalizedMessage[]> {
  const out: NormalizedMessage[] = [];
  for (const id of ids) {
    try {
      const full = await getFullMessage(accessToken, id);
      out.push(normalize(full));
    } catch {
      // Skip a single un-fetchable message rather than fail the whole sweep.
    }
  }
  return out;
}

function collectAttachments(part: GmailPart | undefined, acc: NormalizedMessage["attachments"]): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    acc.push({
      providerAttachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType,
      sizeBytes: part.body.size,
    });
  }
  for (const p of part.parts ?? []) collectAttachments(p, acc);
}

function normalize(msg: GmailMessage): NormalizedMessage {
  const headers = msg.payload?.headers;
  const from = headerValue(headers, "From") ?? "";
  const to = headerValue(headers, "To") ?? "";
  const cc = headerValue(headers, "Cc") ?? "";
  const bcc = headerValue(headers, "Bcc") ?? "";
  const subject = headerValue(headers, "Subject") ?? "";
  const rfcMessageId = headerValue(headers, "Message-ID") ?? undefined;
  const inReplyTo = headerValue(headers, "In-Reply-To") ?? undefined;
  const labelIds = msg.labelIds ?? [];
  const isSent = labelIds.includes("SENT");
  const isDraft = labelIds.includes("DRAFT");

  const { html, text } = extractBodies(msg.payload);
  const attachments: NormalizedMessage["attachments"] = [];
  collectAttachments(msg.payload, attachments);

  const ts = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date();
  const folder: "inbox" | "sent" | "drafts" = isDraft ? "drafts" : isSent ? "sent" : "inbox";

  return {
    providerMessageId: msg.id,
    providerThreadId: msg.threadId,
    rfcMessageId,
    inReplyTo,
    // Drafts + sent are outbound; inbox is inbound.
    direction: isSent || isDraft ? "outbound" : "inbound",
    fromAddress: extractEmail(from),
    fromName: extractName(from),
    toAddresses: splitAddresses(to),
    ccAddresses: splitAddresses(cc),
    bccAddresses: splitAddresses(bcc),
    subject,
    snippet: msg.snippet ?? "",
    bodyHtml: html,
    bodyText: text,
    timestamp: ts,
    attachments,
    folder,
    isRead: !labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    labels: labelIds,
  };
}
