/**
 * Provider-agnostic contract for mailbox providers (Gmail, Microsoft Graph).
 *
 * The rest of the email feature (send route, sync poller, UI) talks only to
 * this interface via getProvider(), so adding a provider later means adding one
 * module — no changes to send/sync logic. All transport is native `fetch`
 * (no SDK deps, per app CLAUDE.md).
 */

export type ProviderName = "gmail" | "microsoft";

/** OAuth tokens returned by a code exchange or refresh. */
export interface TokenSet {
  accessToken: string;
  /** May be absent on refresh (providers often omit it if unchanged). */
  refreshToken?: string;
  /** Absolute expiry; undefined if the provider didn't return expires_in. */
  expiresAt?: Date;
  scope?: string;
}

/** A normalized inbound/sent message, shape-independent of the provider. */
export interface NormalizedMessage {
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  snippet: string;
  bodyHtml?: string;
  bodyText?: string;
  /** When the message was sent/received (best available provider timestamp). */
  timestamp: Date;
  attachments: NormalizedAttachment[];
  // ── Mailbox module (P3) fields ──────────────────────────────────────────────
  /** Which mailbox folder this message came from. */
  folder?: "inbox" | "sent" | "drafts";
  /** Display name of the sender (from the From header), if any. */
  fromName?: string;
  bccAddresses?: string[];
  isRead?: boolean;
  isStarred?: boolean;
  /** Gmail labelIds / Graph categories. */
  labels?: string[];
}

export interface NormalizedAttachment {
  providerAttachmentId: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface SendMessageInput {
  fromAddress: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  /** RFC Message-ID being replied to, for correct threading (In-Reply-To/References). */
  inReplyToRfcId?: string;
  /** Provider thread id to keep the reply in the same conversation (Gmail). */
  providerThreadId?: string;
  /** Provider message id being replied to — lets Microsoft Graph createReply
   *  keep the reply in the ORIGINAL conversation (correct conversationId). */
  inReplyToProviderMessageId?: string;
  attachments?: OutboundAttachment[];
}

export interface OutboundAttachment {
  filename: string;
  mimeType: string;
  /** Raw bytes, base64-encoded. */
  contentBase64: string;
}

export interface SendMessageResult {
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId?: string;
}

/** Result of an incremental sync fetch — new messages plus the advanced cursor. */
export interface SyncResult {
  messages: NormalizedMessage[];
  /** Gmail: new historyId. */
  historyId?: string;
  /** Microsoft: legacy single delta link (P1). */
  deltaLink?: string;
  /** Microsoft: per-folder delta cursors (P2/P3 — delta is per-folder). */
  deltaInbox?: string;
  deltaSent?: string;
  deltaDrafts?: string;
  /**
   * True when the incremental cursor was invalid/expired and the caller should
   * treat this as a bounded re-baseline (we already return the fresh cursor).
   */
  reset?: boolean;
}

/** One page of the initial historical backfill (paginated across cron ticks). */
export interface BackfillResult {
  messages: NormalizedMessage[];
  /**
   * Opaque provider continuation token for the NEXT page (Graph @odata.nextLink
   * or Gmail pageToken). Undefined when this was the last page.
   */
  nextCursor?: string;
  /** True when the backfill is complete (no more pages). */
  done: boolean;
  /**
   * Incremental cursors captured at completion, used to seed live sync so no
   * message is missed in the gap between backfill end and first delta. Gmail
   * returns historyId; Microsoft returns per-folder deltas.
   */
  historyId?: string;
  deltaInbox?: string;
  deltaSent?: string;
  deltaDrafts?: string;
}

/** The mailbox connection fields a provider needs (decrypted access token). */
export interface ProviderContext {
  accessToken: string;
  emailAddress: string;
  historyId?: string | null;
  deltaLink?: string | null;
  /** Microsoft per-folder incremental cursors (P2/P3). */
  deltaInbox?: string | null;
  deltaSent?: string | null;
  deltaDrafts?: string | null;
}

export interface MailboxProvider {
  name: ProviderName;

  /**
   * Build the provider consent URL the user is redirected to.
   *
   * `adminConsent` requests the provider's tenant-wide admin-consent screen
   * (Microsoft `prompt=admin_consent`) — used only by the dedicated admin
   * flow when new permissions require re-consent. The normal per-user connect
   * flow omits it so already-consented tenants don't see an approval prompt.
   */
  getAuthUrl(args: { redirectUri: string; state: string; adminConsent?: boolean }): string;

  /** Exchange an auth code for tokens. */
  exchangeCode(args: { code: string; redirectUri: string }): Promise<TokenSet>;

  /** Refresh an access token from a stored refresh token. */
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;

  /** Fetch the connected mailbox's own email address. */
  getProfileEmail(accessToken: string): Promise<string>;

  /** Best-effort token revoke on disconnect. Never throws. */
  revoke(token: string): Promise<void>;

  /** Send a message. Returns provider + RFC ids for persistence/threading. */
  sendMessage(ctx: ProviderContext, input: SendMessageInput): Promise<SendMessageResult>;

  /**
   * Incremental (live) sync from the stored cursor(s). Returns new messages and
   * the advanced cursor(s). Gmail uses historyId; Microsoft uses per-folder
   * deltas (inbox + sentitems).
   */
  fetchNewMessages(ctx: ProviderContext, opts: { backfillSinceMs: number }): Promise<SyncResult>;

  /**
   * One page of the one-time historical backfill (Inbox + Sent since `sinceMs`).
   * Paginated so a large mailbox is processed across cron ticks: pass the prior
   * page's `nextCursor` back in to continue. On the final page returns
   * `done: true` plus the incremental cursor(s) to seed live sync.
   */
  backfillMessages(
    ctx: ProviderContext,
    opts: { sinceMs: number; cursor?: string | null },
  ): Promise<BackfillResult>;

  /** Fetch a single attachment's bytes (base64) for lazy download. */
  getAttachment(
    ctx: ProviderContext,
    args: { providerMessageId: string; providerAttachmentId: string },
  ): Promise<{ contentBase64: string; mimeType?: string }>;
}
