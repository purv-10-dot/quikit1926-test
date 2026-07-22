"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MessageDto, PublicUser } from "@/lib/shared";
import { EmptyState, MessageSquare } from "@/components/ui";
import { dateDividerLabel } from "@/lib/format";
import { buildMessageRows } from "@/lib/grouping";
import { sortMessagesAsc } from "@/lib/realtime-cache";
import { MessageRow, type MessageRowActions } from "./MessageRow";

export interface MessageListProps {
  messages: MessageDto[];
  currentUserId: string;
  members: PublicUser[];
  memberReadAt: Record<string, string | null>;
  memberDeliveredAt: Record<string, string | null>;
  loading?: boolean;
  actions?: MessageRowActions;
}

interface Snapshot {
  len: number;
  firstId: string | null;
  lastId: string | null;
}

/** How close to the bottom (px) still counts as "at the bottom". */
const NEAR_BOTTOM_PX = 120;

/**
 * Decide how to react to a message-list change. Pure so it's unit-testable.
 *   - no previous snapshot (channel just opened) → scroll to bottom
 *   - list didn't grow → do nothing
 *   - first id changed (older history prepended) → preserve scroll position
 *   - appended at the bottom: scroll if it's the viewer's own send, or if the
 *     viewer is already near the bottom; otherwise leave it (show a pill)
 */
export function decideScroll(
  prev: Snapshot | null,
  next: Snapshot,
  opts: { nearBottom: boolean; lastFromSelf: boolean },
): "bottom" | "preserve" | "none" {
  if (!prev) return "bottom";
  if (next.len <= prev.len) return "none";
  if (prev.firstId && next.firstId !== prev.firstId) return "preserve";
  if (opts.lastFromSelf) return "bottom";
  return opts.nearBottom ? "bottom" : "none";
}

export function MessageList({
  messages,
  currentUserId,
  members,
  memberReadAt,
  memberDeliveredAt,
  loading,
  actions,
}: MessageListProps) {
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  // Defensive: render is always ascending regardless of cache state (Bug 1).
  const ordered = useMemo(() => sortMessagesAsc(messages), [messages]);
  const rows = useMemo(() => buildMessageRows(ordered), [ordered]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevSnap = useRef<Snapshot | null>(null);
  const nearBottomRef = useRef(true);
  const prevHeightRef = useRef(0);
  const [showNewPill, setShowNewPill] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
    setShowNewPill(false);
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    nearBottomRef.current = nearBottom;
    if (nearBottom && showNewPill) setShowNewPill(false);
  };

  useEffect(() => {
    const el = scrollRef.current;
    const next: Snapshot = {
      len: ordered.length,
      firstId: ordered[0]?.id ?? null,
      lastId: ordered[ordered.length - 1]?.id ?? null,
    };
    const last = ordered[ordered.length - 1];
    const lastFromSelf = !!last && last.senderId === currentUserId;
    const decision = decideScroll(prevSnap.current, next, {
      nearBottom: nearBottomRef.current,
      lastFromSelf,
    });

    if (decision === "bottom") {
      // Instant for the initial paint and the viewer's own sends (feels
      // immediate); smooth only for others' incoming while near the bottom.
      const firstPaint = !prevSnap.current;
      scrollToBottom(firstPaint || lastFromSelf ? "auto" : "smooth");
    } else if (decision === "preserve" && el) {
      // Older history prepended: keep the viewport anchored by adding the
      // height delta to scrollTop.
      const delta = el.scrollHeight - prevHeightRef.current;
      el.scrollTop = el.scrollTop + delta;
    } else if (decision === "none" && next.len > (prevSnap.current?.len ?? 0)) {
      setShowNewPill(true);
    }

    prevSnap.current = next;
    if (el) prevHeightRef.current = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, currentUserId]);

  // Re-pin to the bottom when content height grows AFTER a scroll (images,
  // video, PDF chips, reactions, edits all load/measure late) — otherwise the
  // newest message drops below the fold once its media finishes loading. Only
  // re-pins when the viewer is already near the bottom; a scrolled-up reader is
  // never yanked down (the "New messages ↓" pill covers that). Guarded for
  // environments without ResizeObserver.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (nearBottomRef.current) scrollToBottom("auto");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!loading && ordered.length === 0) {
    return (
      <EmptyState title="No messages yet" hint="Say hello 👋" icon={<MessageSquare size={28} />} />
    );
  }

  return (
    <div className="qc-msg-scroll" data-testid="message-list" ref={scrollRef} onScroll={onScroll}>
      {rows.map(({ message, showAuthor, showDateDivider }) => (
        <div key={message.id}>
          {showDateDivider ? (
            <div className="qc-date-divider">
              <span>{dateDividerLabel(message.createdAt)}</span>
            </div>
          ) : null}
          <MessageRow
            message={message}
            showAuthor={showAuthor}
            currentUserId={currentUserId}
            sender={message.senderId ? memberMap.get(message.senderId) : undefined}
            members={members}
            memberReadAt={memberReadAt}
            memberDeliveredAt={memberDeliveredAt}
            actions={actions}
          />
        </div>
      ))}
      <div ref={bottomRef} />
      {showNewPill ? (
        <button
          type="button"
          className="qc-new-messages"
          onClick={() => scrollToBottom("smooth")}
          data-testid="new-messages-pill"
        >
          New messages ↓
        </button>
      ) : null}
    </div>
  );
}
