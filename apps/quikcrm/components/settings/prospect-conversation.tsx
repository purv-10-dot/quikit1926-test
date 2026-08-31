"use client";

import { Paperclip } from "lucide-react";
import type { LinkedInConversationMessage } from "@/lib/services/prospects/linkedin-conversation";

/**
 * LinkedIn chat thread for a prospect.
 *
 * Renders the conversation captured by the Chrome extension and stored in
 * `CrmProspect.linkedinConversation`. Presentational only — the caller passes an
 * already normalized list (see lib/services/prospects/linkedin-conversation.ts);
 * this component never touches the raw JSON blob.
 *
 * Rendering rules that matter:
 *  - Messages appear in `messageOrder` (oldest → newest), exactly as saved.
 *  - Nothing is deduplicated. A thread legitimately repeats identical text from
 *    different senders; each entry is its own bubble.
 *  - Message text is never truncated — long messages wrap and the container
 *    scrolls.
 *  - "sent" is right-aligned, "received" left-aligned. When direction is
 *    unknown the bubble is left-aligned and no claim is made either way.
 */

/** A date separator row, shown when the day changes between messages. */
function DateDivider({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center gap-2" role="separator">
      <span className="h-px flex-1 bg-crm-border" />
      <span className="text-[11px] font-medium uppercase tracking-wide text-crm-muted">
        {label}
      </span>
      <span className="h-px flex-1 bg-crm-border" />
    </div>
  );
}

function MessageBubble({ message }: { message: LinkedInConversationMessage }) {
  const sent = message.direction === "sent";

  return (
    <div className={`flex ${sent ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] ${sent ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        {/* Sender + time. Both come straight from the extractor; either can be
            absent, so neither is fabricated when missing. */}
        <div className="flex items-baseline gap-2 px-1">
          <span className="text-xs font-semibold text-crm-text">
            {message.senderName || "Unknown sender"}
          </span>
          {message.time && (
            <span className="text-[11px] text-crm-muted">{message.time}</span>
          )}
        </div>

        <div
          className={
            "rounded-lg px-3 py-2 text-sm leading-relaxed " +
            (sent
              ? "bg-crm-blue text-white"
              : "bg-crm-surface-2 text-crm-text border border-crm-border")
          }
        >
          {/* whitespace-pre-wrap keeps the original line breaks; break-words
              stops a long unbroken URL from widening the modal. Never clamped —
              the full message text is always rendered. */}
          <p className="whitespace-pre-wrap break-words">
            {message.text || <span className="italic opacity-70">(no text)</span>}
          </p>

          {message.attachmentCount > 0 && (
            <p
              className={
                "mt-1 flex items-center gap-1 text-[11px] " +
                (sent ? "text-white/80" : "text-crm-muted")
              }
            >
              <Paperclip size={11} aria-hidden />
              {message.attachmentCount} attachment
              {message.attachmentCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProspectConversation({
  messages,
}: {
  messages: LinkedInConversationMessage[];
}) {
  if (messages.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-crm-muted">
        No conversation captured for this prospect.
      </p>
    );
  }

  let lastDate = "";

  return (
    // Fixed max height + overflow so a long thread scrolls inside the modal
    // rather than pushing it past the viewport.
    <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto pr-1">
      {messages.map((m, i) => {
        // A date separator is emitted whenever the day changes. `date` is
        // LinkedIn's own label ("TODAY", "Wednesday"), not a parsed date.
        const showDate = Boolean(m.date) && m.date !== lastDate;
        if (showDate) lastDate = m.date;

        return (
          // Key on position, not content: identical text recurs legitimately in
          // these threads, so content-derived keys would collide.
          <div key={`${m.messageOrder}-${i}`}>
            {showDate && <DateDivider label={m.date} />}
            <MessageBubble message={m} />
          </div>
        );
      })}
    </div>
  );
}
