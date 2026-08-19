/**
 * Incremental (append-only) merge for a prospect's saved LinkedIn conversation.
 *
 * The extractor re-returns the WHOLE thread every time it runs, so a naive save
 * would double the stored history on each click. This finds where the saved
 * conversation ends inside the freshly fetched one and appends only what comes
 * after it.
 *
 * ── Why alignment, not text dedupe ────────────────────────────────────────
 * Message text is emphatically NOT unique. A real thread contains
 *
 *     Anurag: Well        Adarsh: Well
 *     Anurag: No problem  Adarsh: No problem
 *
 * and each of those is a distinct message. So we never dedupe by text (or even
 * by sender+text): we align the two SEQUENCES and keep everything after the
 * overlap. Position is the identity.
 *
 * ── Strategy ──────────────────────────────────────────────────────────────
 *  1. If any messages carry a stable `messageId`, align on the last saved id
 *     found in the fetched list. That is the strongest signal available.
 *  2. Otherwise, find the longest k such that the LAST k saved messages equal
 *     the FIRST k of some prefix of the fetched list ending at position k —
 *     i.e. the fetched list starts with the saved list (possibly after the
 *     saved history was itself truncated by LinkedIn's virtualisation).
 *  3. Failing both, treat the fetch as disjoint and append all of it, which is
 *     the only lossless choice: dropping messages we cannot place would lose
 *     real history.
 */

/** A stored conversation message. Mirrors what the API writes. */
export interface StoredMessage {
  messageId: string | null;
  senderName: string | null;
  senderProfileUrl: string | null;
  receiverName: string | null;
  text: string | null;
  timestamp: string | null;
  date: string | null;
  time: string | null;
  direction: string | null;
  messageOrder: number;
  source: string;
  attachments: Array<{ type: string | null; name: string | null; url: string | null }>;
}

export interface StoredConversation {
  participant: { name: string | null; profileUrl: string | null } | null;
  threadId: string | null;
  capturedAt: string;
  messageCount: number;
  messages: StoredMessage[];
}

export interface MergeResult {
  conversation: StoredConversation;
  /** How many messages were appended by this merge. 0 means nothing new. */
  appendedCount: number;
  /** Total after merging. */
  totalCount: number;
  /** Which alignment strategy resolved the overlap — surfaced for diagnostics. */
  strategy: "no-existing" | "message-id" | "sequence-prefix" | "disjoint-append" | "no-new";
}

/**
 * Identity of a message for SEQUENCE comparison. Deliberately excludes
 * messageOrder (which we reassign) and attachments (whose URLs are signed and
 * rotate between fetches, so they are not stable).
 */
function sameMessage(a: StoredMessage, b: StoredMessage): boolean {
  // A stable id on both sides is decisive.
  if (a.messageId && b.messageId) return a.messageId === b.messageId;
  return (
    (a.text ?? "") === (b.text ?? "") &&
    (a.senderName ?? "") === (b.senderName ?? "") &&
    (a.time ?? "") === (b.time ?? "") &&
    (a.date ?? "") === (b.date ?? "") &&
    (a.direction ?? "") === (b.direction ?? "")
  );
}

/** Read the message array out of either stored shape. */
export function extractStoredMessages(raw: unknown): StoredMessage[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as StoredMessage[];
  if (typeof raw === "object") {
    const env = raw as { messages?: unknown };
    if (Array.isArray(env.messages)) return env.messages as StoredMessage[];
  }
  return [];
}

/**
 * Merge a freshly fetched conversation into the saved one, appending only the
 * genuinely new tail.
 *
 * `existingRaw` is the untrusted stored blob; `fetched` is the already
 * normalised incoming conversation.
 */
export function mergeLinkedInConversation(
  existingRaw: unknown,
  fetched: StoredConversation,
): MergeResult {
  const existing = extractStoredMessages(existingRaw);
  const incoming = fetched.messages ?? [];

  // ── First ever save: store the fetch as-is. ──────────────────────────────
  if (existing.length === 0) {
    const messages = incoming.map((m, i) => ({ ...m, messageOrder: i + 1 }));
    return {
      conversation: { ...fetched, messageCount: messages.length, messages },
      appendedCount: messages.length,
      totalCount: messages.length,
      strategy: "no-existing",
    };
  }

  // Highest order already used — new messages continue from here, so existing
  // messageOrder values are never rewritten.
  const maxOrder = existing.reduce(
    (mx, m) => (typeof m.messageOrder === "number" && m.messageOrder > mx ? m.messageOrder : mx),
    0,
  );

  let cutIndex = -1; // index in `incoming` of the last already-saved message
  let strategy: MergeResult["strategy"] = "disjoint-append";

  // ── 1. Align on a stable messageId when both sides have them. ────────────
  const savedIds = new Set(existing.map((m) => m.messageId).filter(Boolean) as string[]);
  if (savedIds.size > 0) {
    for (let i = incoming.length - 1; i >= 0; i--) {
      const id = incoming[i].messageId;
      if (id && savedIds.has(id)) {
        cutIndex = i;
        strategy = "message-id";
        break;
      }
    }
  }

  // ── 2. Sequence alignment. ───────────────────────────────────────────────
  // Find the longest overlap where the tail of `existing` matches a prefix of
  // `incoming`. Longest-first so we never under-match and re-append history.
  //
  // This handles both the normal case (fetched starts with the entire saved
  // thread) and the virtualised case (fetched begins mid-history, so only the
  // saved tail overlaps).
  if (cutIndex === -1) {
    const maxOverlap = Math.min(existing.length, incoming.length);
    for (let k = maxOverlap; k >= 1; k--) {
      let match = true;
      for (let j = 0; j < k; j++) {
        if (!sameMessage(existing[existing.length - k + j], incoming[j])) {
          match = false;
          break;
        }
      }
      if (match) {
        cutIndex = k - 1;
        strategy = "sequence-prefix";
        break;
      }
    }
  }

  // ── 3. Append the tail after the overlap. ────────────────────────────────
  const tail = incoming.slice(cutIndex + 1);

  if (tail.length === 0) {
    // Identical fetch — nothing to do. Existing messages are returned exactly
    // as stored, with their original messageOrder untouched.
    return {
      conversation: {
        participant: fetched.participant ?? null,
        threadId: fetched.threadId ?? null,
        capturedAt: new Date().toISOString(),
        messageCount: existing.length,
        messages: existing,
      },
      appendedCount: 0,
      totalCount: existing.length,
      strategy: cutIndex === -1 ? "disjoint-append" : "no-new",
    };
  }

  const appended = tail.map((m, i) => ({ ...m, messageOrder: maxOrder + i + 1 }));
  const messages = existing.concat(appended);

  return {
    conversation: {
      participant: fetched.participant ?? null,
      threadId: fetched.threadId ?? null,
      capturedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
    },
    appendedCount: appended.length,
    totalCount: messages.length,
    strategy,
  };
}
