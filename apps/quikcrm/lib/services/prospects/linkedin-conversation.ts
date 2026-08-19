/**
 * Normalizer for the LinkedIn extension's `linkedinConversation` blob.
 *
 * `CrmProspect.linkedinConversation` is untrusted, extension-owned JSON: its
 * shape is whatever the conversation extractor produced at save time, across
 * several builds. Parsing it SERVER-SIDE (exactly as parseLinkedInPosts /
 * parseLinkedInCompany / parseLinkedInExperiences do for the other blobs) means
 * the client only ever receives a typed, render-safe list and a malformed
 * scrape can never break the Prospects UI.
 *
 * Every field except the message text is optional — the extractor returns null
 * for anything LinkedIn does not expose, and never invents data.
 */

/** One message in a captured LinkedIn thread. */
export interface LinkedInConversationMessage {
  messageId: string;
  senderName: string;
  senderProfileUrl: string;
  receiverName: string;
  text: string;
  /** Machine timestamp when LinkedIn exposed one. */
  timestamp: string;
  /** Date separator as LinkedIn renders it, e.g. "TODAY" or "Wednesday". */
  date: string;
  /** Human clock time, e.g. "6:54 PM". */
  time: string;
  /** "sent" (by the signed-in member) or "received"; "" when unresolved. */
  direction: "sent" | "received" | "";
  /** Authoritative chronological position, oldest → newest. */
  messageOrder: number;
  attachmentCount: number;
}

export interface LinkedInConversation {
  participantName: string;
  participantProfileUrl: string;
  threadId: string;
  capturedAt: string;
  messages: LinkedInConversationMessage[];
}

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** Only http(s) URLs — never `javascript:` or `data:` from an untrusted blob. */
function safeUrl(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "";
}

/**
 * Upper bound on rendered messages. A guard against a malformed or hostile
 * blob, deliberately far above any real thread — it is NOT a business rule, and
 * a normal conversation of any length is returned in full.
 */
const MAX_MESSAGES = 5000;

/**
 * Parse the stored blob into a typed conversation. Never throws; returns null
 * when there is no usable conversation so callers can render "no conversation"
 * without a count.
 *
 * Accepts both stored shapes: the envelope written by the API
 * ({ participant, threadId, messages }) and a bare message array from any
 * earlier payload.
 *
 * IMPORTANT: messages are never deduplicated. A thread legitimately repeats the
 * same text from different senders ("Well", "No problem"); each occurrence is a
 * distinct message, ordered by `messageOrder`.
 */
export function parseLinkedInConversation(raw: unknown): LinkedInConversation | null {
  if (!raw || typeof raw !== "object") return null;

  let rawMessages: unknown[];
  let participantName = "";
  let participantProfileUrl = "";
  let threadId = "";
  let capturedAt = "";

  if (Array.isArray(raw)) {
    rawMessages = raw;
  } else {
    const env = raw as Record<string, unknown>;
    if (!Array.isArray(env.messages)) return null;
    rawMessages = env.messages;
    const p = env.participant;
    if (p && typeof p === "object" && !Array.isArray(p)) {
      const pr = p as Record<string, unknown>;
      participantName = str(pr.name);
      participantProfileUrl = safeUrl(pr.profileUrl);
    }
    threadId = str(env.threadId);
    capturedAt = str(env.capturedAt);
  }

  const messages: LinkedInConversationMessage[] = [];
  for (const item of rawMessages.slice(0, MAX_MESSAGES)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const m = item as Record<string, unknown>;

    const text = str(m.text);
    const attachments = Array.isArray(m.attachments) ? m.attachments : [];
    // A message with neither text nor media carries nothing to show.
    if (!text && attachments.length === 0) continue;

    const dir = str(m.direction);
    messages.push({
      messageId: str(m.messageId),
      senderName: str(m.senderName),
      senderProfileUrl: safeUrl(m.senderProfileUrl),
      receiverName: str(m.receiverName),
      text,
      timestamp: str(m.timestamp),
      date: str(m.date),
      time: str(m.time),
      direction: dir === "sent" || dir === "received" ? dir : "",
      messageOrder:
        typeof m.messageOrder === "number" && Number.isFinite(m.messageOrder)
          ? m.messageOrder
          : messages.length + 1,
      attachmentCount: attachments.length,
    });
  }

  if (messages.length === 0) return null;

  // Sort by the authoritative order key. A stable tiebreak on the original
  // index keeps identical adjacent messages in their captured sequence.
  messages.sort((a, b) => a.messageOrder - b.messageOrder);

  return {
    participantName,
    participantProfileUrl,
    threadId,
    capturedAt,
    messages,
  };
}
