/**
 * Microsoft provider — Microsoft Graph v1.0 + Entra (Azure AD) OAuth 2.0, over
 * native fetch. No @azure/msal / graph-client SDKs (app CLAUDE.md).
 *
 * Scopes: Mail.Send, Mail.Read, offline_access (refresh token), User.Read
 * (profile email). Sends via /me/sendMail JSON; syncs via the messages `delta`
 * query which returns a deltaLink cursor for the next incremental pull.
 */

import { env } from "@/lib/env";
import { htmlToText } from "./mime";
import { providerFetch } from "./http";
import type { MailboxProvider, NormalizedMessage, SendMessageInput, TokenSet } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["offline_access", "openid", "email", "User.Read", "Mail.Read", "Mail.Send"];

function authBase(): string {
  return `https://login.microsoftonline.com/${env().MICROSOFT_TENANT_ID}/oauth2/v2.0`;
}

function creds() {
  const e = env();
  if (!e.MICROSOFT_CLIENT_ID || !e.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft OAuth is not configured (MICROSOFT_CLIENT_ID/SECRET).");
  }
  return { id: e.MICROSOFT_CLIENT_ID, secret: e.MICROSOFT_CLIENT_SECRET };
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

export const microsoftProvider: MailboxProvider = {
  name: "microsoft",

  getAuthUrl({ redirectUri, state, adminConsent }) {
    const { id } = creds();
    const q = new URLSearchParams({
      client_id: id,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
    });
    // Normal per-user connect: omit `prompt` so users whose tenant already
    // granted admin consent aren't forced through the consent/"need admin
    // approval" screen every login. Only the dedicated admin-consent flow
    // (adminConsent=true) requests the tenant-wide approval screen, which is
    // what to use if new scopes are ever added that require re-consent.
    if (adminConsent) q.set("prompt", "admin_consent");
    return `${authBase()}/authorize?${q.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const { id, secret } = creds();
    const json = await providerFetch<Record<string, unknown>>(`${authBase()}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: SCOPES.join(" "),
      }).toString(),
    });
    return parseTokenResponse(json);
  },

  async refreshAccessToken(refreshToken) {
    const { id, secret } = creds();
    const json = await providerFetch<Record<string, unknown>>(`${authBase()}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: SCOPES.join(" "),
      }).toString(),
    });
    const set = parseTokenResponse(json);
    if (!set.refreshToken) set.refreshToken = refreshToken;
    return set;
  },

  async getProfileEmail(accessToken) {
    const json = await providerFetch<{ mail?: string; userPrincipalName?: string }>(
      `${GRAPH}/me?$select=mail,userPrincipalName`,
      { headers: authHeader(accessToken) },
    );
    const email = json.mail ?? json.userPrincipalName;
    if (!email) throw new Error("Microsoft profile did not return an email address.");
    return email.toLowerCase();
  },

  async revoke() {
    // Graph has no simple token-revoke endpoint for confidential clients;
    // deleting the stored token server-side is our disconnect. No-op here.
  },

  async sendMessage(ctx, input) {
    // We deliberately DO NOT use /me/sendMail: it returns 202 with no id, forcing
    // a guess of "the latest Sent Items message", which mis-captured the wrong
    // conversationId when subjects collided (threading regression). Instead we
    // create a draft (which returns the real id + conversationId), then send it.
    const headers = { ...authHeader(ctx.accessToken), "content-type": "application/json" };

    // Create the draft. For a reply, createReply keeps it in the ORIGINAL
    // conversation (correct conversationId); otherwise create a fresh draft.
    let draft: GraphMessage;
    if (input.inReplyToProviderMessageId) {
      // createReply returns a draft seeded with the original's conversationId +
      // quoted history; we then set our body/recipients before sending.
      const reply = await providerFetch<GraphMessage>(
        `${GRAPH}/me/messages/${input.inReplyToProviderMessageId}/createReply`,
        { method: "POST", headers, body: "{}" },
      );
      // Patch the reply draft with our content + recipients.
      draft = await providerFetch<GraphMessage>(`${GRAPH}/me/messages/${reply.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          body: { contentType: "HTML", content: input.bodyHtml },
          ...(input.cc?.length
            ? { ccRecipients: input.cc.map((a) => ({ emailAddress: { address: a } })) }
            : {}),
          ...(input.bcc?.length
            ? { bccRecipients: input.bcc.map((a) => ({ emailAddress: { address: a } })) }
            : {}),
        }),
      });
    } else {
      draft = await providerFetch<GraphMessage>(`${GRAPH}/me/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildGraphMessage(input)),
      });
    }

    // Send the draft. /send returns 202 with no body; the ids we need are the
    // draft's (send does not change the message id or conversationId).
    await providerFetch(`${GRAPH}/me/messages/${draft.id}/send`, { method: "POST", headers });

    return {
      providerMessageId: draft.id,
      providerThreadId: draft.conversationId ?? draft.id,
      rfcMessageId: draft.internetMessageId,
    };
  },

  async fetchNewMessages(ctx, opts) {
    // Graph delta is a PER-FOLDER operation, so Inbox and Sent Items are tracked
    // with SEPARATE cursors. Run both, merge the results. This is what captures
    // mail sent directly from Outlook (it lands in Sent Items, not Inbox).
    const sinceIso = new Date(opts.backfillSinceMs).toISOString();
    const [inbox, sent, drafts] = await Promise.all([
      folderDelta(ctx.accessToken, "inbox", ctx.deltaInbox ?? null, sinceIso),
      folderDelta(ctx.accessToken, "sentitems", ctx.deltaSent ?? null, sinceIso),
      folderDelta(ctx.accessToken, "drafts", ctx.deltaDrafts ?? null, sinceIso),
    ]);

    const messages = [...inbox.messages, ...sent.messages, ...drafts.messages]
      .map(normalize)
      .filter(Boolean) as NormalizedMessage[];

    return {
      messages,
      deltaInbox: inbox.deltaLink,
      deltaSent: sent.deltaLink,
      deltaDrafts: drafts.deltaLink,
      reset: inbox.reset || sent.reset || drafts.reset,
    };
  },

  async backfillMessages(ctx, { sinceMs, cursor }) {
    // Backfill Inbox + Sent + Drafts since `sinceMs`, paginated across ticks. We
    // encode all THREE folders' continuation state in one cursor string so the
    // state machine stays provider-agnostic (JSON: {inbox?, sent?, drafts?}).
    const sinceIso = new Date(sinceMs).toISOString();
    const state = decodeBackfillCursor(cursor);

    // Advance whichever folders still have pages this tick.
    const [inbox, sent, drafts] = await Promise.all([
      backfillFolder(ctx.accessToken, "inbox", state.inbox, sinceIso),
      backfillFolder(ctx.accessToken, "sentitems", state.sent, sinceIso),
      backfillFolder(ctx.accessToken, "drafts", state.drafts, sinceIso),
    ]);

    const messages = [...inbox.messages, ...sent.messages, ...drafts.messages]
      .map(normalize)
      .filter(Boolean) as NormalizedMessage[];

    const done = inbox.done && sent.done && drafts.done;
    // Carry each finished folder's deltaLink in a "done:<delta>" sentinel so it
    // survives until every folder finishes.
    const sentinel = (f: { done: boolean; deltaLink?: string; nextLink?: string }) =>
      f.done ? `done:${f.deltaLink ?? ""}` : f.nextLink;
    return {
      messages,
      done,
      nextCursor: done
        ? undefined
        : encodeBackfillCursor({
            inbox: sentinel(inbox),
            sent: sentinel(sent),
            drafts: sentinel(drafts),
          }),
      // On completion, each folder's deltaLink seeds live sync.
      deltaInbox: done ? inbox.deltaLink : undefined,
      deltaSent: done ? sent.deltaLink : undefined,
      deltaDrafts: done ? drafts.deltaLink : undefined,
    };
  },

  async getAttachment(ctx, { providerMessageId, providerAttachmentId }) {
    const json = await providerFetch<{ contentBytes?: string; contentType?: string }>(
      `${GRAPH}/me/messages/${providerMessageId}/attachments/${providerAttachmentId}`,
      { headers: authHeader(ctx.accessToken) },
    );
    return { contentBase64: json.contentBytes ?? "", mimeType: json.contentType };
  },
};

// ─── Internal ─────────────────────────────────────────────────────────────────

const DELTA_SELECT =
  "id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,bccRecipients,body,bodyPreview,receivedDateTime,sentDateTime,isDraft,isRead,hasAttachments,flag,categories";

type Folder = "inbox" | "sentitems" | "drafts";

/** Map a Graph folder id to the normalized mailbox folder name. */
function folderName(f: Folder): "inbox" | "sent" | "drafts" {
  return f === "sentitems" ? "sent" : f === "drafts" ? "drafts" : "inbox";
}
/** Stamp the source folder onto each raw message so normalize() can read it. */
function tagFolder(messages: GraphMessage[], f: Folder): GraphMessage[] {
  const folder = folderName(f);
  for (const m of messages) m.__folder = folder;
  return messages;
}

/**
 * Live incremental delta for ONE folder. Drains all nextLink pages until the
 * deltaLink (end-of-changes), returning the messages + the new deltaLink cursor.
 * A missing/expired cursor re-baselines from `sinceIso` (bounded by the filter).
 */
async function folderDelta(
  accessToken: string,
  folder: Folder,
  cursor: string | null,
  sinceIso: string,
): Promise<{ messages: GraphMessage[]; deltaLink?: string; reset: boolean }> {
  const start =
    cursor ||
    `${GRAPH}/me/mailFolders/${folder}/messages/delta?$select=${DELTA_SELECT}&$top=50&$filter=receivedDateTime ge ${sinceIso}`;
  let url: string | undefined = start;
  let deltaLink: string | undefined;
  const messages: GraphMessage[] = [];
  try {
    while (url) {
      const page: GraphDeltaPage = await providerFetch<GraphDeltaPage>(url, {
        headers: authHeader(accessToken),
      });
      messages.push(...tagFolder(page.value ?? [], folder));
      deltaLink = page["@odata.deltaLink"] ?? deltaLink;
      url = page["@odata.nextLink"];
    }
    return { messages, deltaLink, reset: false };
  } catch {
    // Expired deltaLink → re-baseline this folder once from the window.
    if (cursor) {
      const rebased = await folderDelta(accessToken, folder, null, sinceIso);
      return { ...rebased, reset: true };
    }
    throw new Error(`Microsoft delta sync failed for ${folder}.`);
  }
}

/**
 * One page of backfill for ONE folder. Returns the page's messages, the next
 * page's nextLink (if more), and — when the folder is exhausted — its deltaLink
 * to seed live sync. `cursor` is the folder's prior nextLink (or null to start).
 */
async function backfillFolder(
  accessToken: string,
  folder: Folder,
  cursor: string | null | undefined,
  sinceIso: string,
): Promise<{ messages: GraphMessage[]; nextLink?: string; deltaLink?: string; done: boolean }> {
  // A "done" folder carries the sentinel "done:<deltaLink>" so we stop paging it.
  if (cursor && cursor.startsWith("done:")) {
    return { messages: [], deltaLink: cursor.slice(5) || undefined, done: true };
  }
  const start =
    cursor ||
    `${GRAPH}/me/mailFolders/${folder}/messages/delta?$select=${DELTA_SELECT}&$top=50&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${sinceIso}`;
  const page: GraphDeltaPage = await providerFetch<GraphDeltaPage>(start, {
    headers: authHeader(accessToken),
  });
  const messages = tagFolder(page.value ?? [], folder);
  if (page["@odata.nextLink"]) {
    return { messages, nextLink: page["@odata.nextLink"], done: false };
  }
  // No nextLink → this folder is exhausted; deltaLink seeds live sync.
  return { messages, deltaLink: page["@odata.deltaLink"], done: true };
}

/** Per-folder backfill continuation encoded as JSON in the single cursor slot. */
interface BackfillState {
  inbox?: string | null;
  sent?: string | null;
  drafts?: string | null;
}
function decodeBackfillCursor(cursor: string | null | undefined): BackfillState {
  if (!cursor) return {};
  try {
    return JSON.parse(cursor) as BackfillState;
  } catch {
    return {};
  }
}
function encodeBackfillCursor(state: { inbox?: string; sent?: string; drafts?: string }): string {
  // Callers pass either the folder's next-page link, or a "done:<deltaLink>"
  // sentinel for a folder that finished this tick (so the next tick skips it).
  return JSON.stringify({
    inbox: state.inbox ?? "done:",
    sent: state.sent ?? "done:",
    drafts: state.drafts ?? "done:",
  });
}

interface GraphRecipient {
  emailAddress?: { address?: string; name?: string };
}
interface GraphMessage {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  isDraft?: boolean;
  isRead?: boolean;
  hasAttachments?: boolean;
  flag?: { flagStatus?: string };
  categories?: string[];
  "@removed"?: unknown;
  /** Set by tagFolder() from the folder the message was fetched from. */
  __folder?: "inbox" | "sent" | "drafts";
}
interface GraphDeltaPage {
  value?: GraphMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

function addr(r: GraphRecipient | undefined): string {
  return (r?.emailAddress?.address ?? "").toLowerCase();
}
function addrs(list: GraphRecipient[] | undefined): string[] {
  return (list ?? []).map(addr).filter(Boolean);
}

function normalize(msg: GraphMessage): NormalizedMessage | null {
  if (msg["@removed"]) return null; // skip deletions (drafts ARE kept for P3)
  const html = msg.body?.contentType === "html" ? msg.body?.content : undefined;
  const text =
    msg.body?.contentType === "text" ? msg.body?.content : html ? htmlToText(html) : undefined;
  // Folder is authoritative (the delta folder it came from); fall back to
  // timestamp/isDraft heuristics if a caller didn't tag it.
  const folder: "inbox" | "sent" | "drafts" =
    msg.__folder ?? (msg.isDraft ? "drafts" : msg.sentDateTime && !msg.receivedDateTime ? "sent" : "inbox");
  const tsRaw = msg.receivedDateTime ?? msg.sentDateTime;
  return {
    providerMessageId: msg.id,
    providerThreadId: msg.conversationId ?? msg.id,
    rfcMessageId: msg.internetMessageId,
    direction: folder === "inbox" ? "inbound" : "outbound",
    fromAddress: addr(msg.from),
    fromName: msg.from?.emailAddress?.name ?? "",
    toAddresses: addrs(msg.toRecipients),
    ccAddresses: addrs(msg.ccRecipients),
    bccAddresses: addrs(msg.bccRecipients),
    subject: msg.subject ?? "",
    snippet: msg.bodyPreview ?? "",
    bodyHtml: html,
    bodyText: text,
    timestamp: tsRaw ? new Date(tsRaw) : new Date(),
    attachments: [], // fetched lazily; hasAttachments flag not expanded in delta
    folder,
    isRead: msg.isRead ?? true,
    isStarred: msg.flag?.flagStatus === "flagged",
    labels: msg.categories ?? [],
  };
}

function buildGraphMessage(input: SendMessageInput): Record<string, unknown> {
  return {
    subject: input.subject,
    body: { contentType: "HTML", content: input.bodyHtml },
    toRecipients: input.to.map((a) => ({ emailAddress: { address: a } })),
    ...(input.cc?.length
      ? { ccRecipients: input.cc.map((a) => ({ emailAddress: { address: a } })) }
      : {}),
    ...(input.bcc?.length
      ? { bccRecipients: input.bcc.map((a) => ({ emailAddress: { address: a } })) }
      : {}),
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((att) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: att.filename,
            contentType: att.mimeType,
            contentBytes: att.contentBase64,
          })),
        }
      : {}),
  };
}
