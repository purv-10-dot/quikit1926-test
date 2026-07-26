/**
 * Mail-connector contracts. Gmail and Outlook implement the same `MailProvider`
 * interface so the OAuth routes, the outbound send action, and the inbound
 * poll scan are all provider-agnostic — adding a provider is one new file, no
 * plumbing changes.
 */

/** A provider id backed by a WfProvider enum value. */
export type MailProviderId = "gmail" | "outlook";

/** An outbound message to send from a connected mailbox. */
export interface MailMessage {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  /** Send the body as text/html instead of text/plain. */
  html?: boolean;
}

/** A normalized inbound message surfaced by a poll. */
export interface InboundMail {
  messageId: string;
  threadId: string | null;
  from: string;
  fromName: string | null;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  /** ISO-8601 receive time. */
  receivedAt: string;
  hasAttachments: boolean;
}

/** The result of a token exchange or refresh. */
export interface TokenSet {
  accessToken: string;
  /** Absent on refresh responses that don't re-issue one. */
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
  /** The connected mailbox address — used as the WfConnection label. */
  email: string;
}

/** A provider's OAuth + Mail REST surface, all via plain fetch (no SDK deps). */
export interface MailProvider {
  id: MailProviderId;
  label: string;
  scopes: string[];
  /** Build the consent-screen URL the user is redirected to. */
  buildAuthUrl(redirectUri: string, state: string): string;
  /** Exchange an authorization code for tokens + the mailbox address. */
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  /** Refresh an access token; `email` may be re-resolved or echoed by the caller. */
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Send one message from the mailbox; returns the provider message id. */
  sendMessage(accessToken: string, from: string, msg: MailMessage): Promise<{ id: string }>;
  /**
   * List messages newer than `cursor` (a provider-specific watermark). On the
   * first poll (`cursor === null`) it returns no messages and a fresh watermark
   * of "now", so QuikFlow never backfills an entire mailbox.
   */
  listSince(accessToken: string, cursor: string | null): Promise<{ messages: InboundMail[]; nextCursor: string | null }>;
}
