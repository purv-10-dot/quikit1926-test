"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MessageDto, PublicUser } from "@/lib/shared";
import { EmptyState, MessageSquare } from "@/components/ui";
import { dateDividerLabel, unreadDividerLabel } from "@/lib/format";
import { buildMessageRows, findUnreadDivider } from "@/lib/grouping";
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
  /**
   * This user's unread count for the channel, captured the instant it was
   * opened — BEFORE the read-PATCH zeroes it (see ChatWorkspace's
   * pickChannel/selectChannel). 0 (the default) renders no divider.
   */
  openedUnreadCount?: number;
  /**
   * True while `messages` is still (re)settling — including a background
   * refetch of already-cached data, not just the first-ever load. The
   * unread divider's one-time resolution waits for this to go false: a
   * stale cached page can be short a message or two relative to
   * `openedUnreadCount` (React Query serves it instantly, before the
   * refetch catches up), and resolving against that short array pins the
   * divider one message too high for the rest of the mount — permanently,
   * since it never re-resolves. Default `false` (assume settled) so callers
   * that don't pass it — including every existing test — keep today's
   * resolve-on-first-render behavior.
   */
  messagesFetching?: boolean;
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
  openedUnreadCount = 0,
  messagesFetching = false,
}: MessageListProps) {
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  // Defensive: render is always ascending regardless of cache state (Bug 1).
  const ordered = useMemo(() => sortMessagesAsc(messages), [messages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevSnap = useRef<Snapshot | null>(null);
  const nearBottomRef = useRef(true);
  const prevHeightRef = useRef(0);
  const [showNewPill, setShowNewPill] = useState(false);

  // Computed at RENDER time, not inside an effect, so both the resolution
  // effect and the scroll effect below see the SAME answer regardless of
  // which one's effect happens to run first for this commit. `prevSnap.
  // current` still holds the LAST COMMITTED snapshot here — the scroll
  // effect only overwrites it after using it — so this comparison is exactly
  // as accurate as reading it from inside that effect would be.
  const last = ordered[ordered.length - 1];
  const lastFromSelf = !!last && last.senderId === currentUserId;
  const grewFromSelf = !!prevSnap.current && ordered.length > prevSnap.current.len && lastFromSelf;

  // True the first time a genuine NEW send of the viewer's own is observed
  // in this mount, and every render after. Read by the resolution effect
  // below: a send landing before the divider ever resolves means the user
  // already read everything above by the time there'd be anything to show,
  // so resolution must be skipped outright — resolving-then-clearing would
  // still flash the line into existence for a frame first.
  const sentSinceOpenRef = useRef(false);
  if (grewFromSelf) sentSinceOpenRef.current = true;

  // RESOLVE THE UNREAD DIVIDER EXACTLY ONCE PER MOUNT — `resolvedRef` makes
  // that invariant explicit in code rather than leaning on useState's
  // one-shot initializer semantics, which reads as an implementation detail
  // a future reader could "simplify" into an effect that runs on every
  // `ordered` change. Resolving more than once is precisely the bug a
  // negative control caught earlier: un-freezing it made the divider chase
  // newly-arrived messages instead of staying where the user's unread
  // messages actually began.
  //
  // Waiting for `!messagesFetching` (rather than resolving on first render,
  // as before) is what fixes a real bug beyond that: a stale cached
  // `messages` page can be short relative to `openedUnreadCount` (React
  // Query serves it instantly, before a background refetch catches up), and
  // resolving against that short array used to pin the divider one message
  // too high for the rest of the mount, with no way to recover — see
  // findUnreadDivider's fallback branch. A self-heal (re-resolve whenever the
  // frozen count fell short) was considered and rejected: the messages query
  // wholesale-replaces its cache on refetch while a live socket arrival
  // merges into the SAME array a different way (mergeMessageEvent), so
  // "array grew because history caught up" and "array grew because someone
  // just sent a message" are not reliably distinguishable from the array's
  // shape alone — a self-heal would eventually misattribute a live arrival
  // as an original unread message and drift the count upward, which is
  // exactly the chasing this design exists to prevent. Asking React Query's
  // own fetch state is unambiguous where inferring freshness after the fact
  // isn't.
  const resolvedRef = useRef(false);
  const [unreadDivider, setUnreadDivider] = useState<ReturnType<typeof findUnreadDivider>>(null);
  useEffect(() => {
    if (resolvedRef.current || messagesFetching) return;
    resolvedRef.current = true;
    if (sentSinceOpenRef.current) return; // see the comment above — skip, don't clear-after.
    setUnreadDivider(findUnreadDivider(ordered, currentUserId, openedUnreadCount));
  }, [messagesFetching, ordered, currentUserId, openedUnreadCount]);

  const rows = useMemo(
    () => buildMessageRows(ordered, unreadDivider?.messageId ?? null),
    [ordered, unreadDivider],
  );

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

  // KNOWN FOLLOW-UP (out of scope for the unread-divider work that added
  // `unreadDivider` above): Teams/WhatsApp scroll to the unread line on open,
  // not to the bottom. `decideScroll`'s "bottom" on first paint (below)
  // ignores it, so a divider above a large unread block currently renders
  // off-screen until the user scrolls up to find it.
  useEffect(() => {
    const el = scrollRef.current;
    const next: Snapshot = {
      len: ordered.length,
      firstId: ordered[0]?.id ?? null,
      lastId: ordered[ordered.length - 1]?.id ?? null,
    };
    const decision = decideScroll(prevSnap.current, next, {
      nearBottom: nearBottomRef.current,
      lastFromSelf,
    });

    // Sending implies you've read everything above (WhatsApp/Teams both
    // clear the unread line once you send) — `grewFromSelf` (computed at
    // render time, above) is already false on first paint and false for a
    // growth caused by someone else's incoming message, which must leave the
    // line untouched. A send landing before the divider ever resolved is
    // handled separately, by skipping resolution outright (see the
    // resolution effect above) rather than clearing here after the fact.
    if (grewFromSelf && unreadDivider) {
      setUnreadDivider(null);
    }

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
      {rows.map(({ message, showAuthor, showDateDivider, showUnreadDivider }) => (
        <div key={message.id}>
          {showDateDivider ? (
            <div className="qc-date-divider">
              <span>{dateDividerLabel(message.createdAt)}</span>
            </div>
          ) : null}
          {showUnreadDivider ? (
            <div className="qc-unread-divider" data-testid="unread-divider">
              {/* `unreadDivider!.count`, never `openedUnreadCount` — this row
                  only renders when `showUnreadDivider` matched a real
                  `unreadDivider`, and the count must be the one that
                  resolution actually produced (see findUnreadDivider's doc)
                  so the label can never disagree with where it's rendered. */}
              <span>{unreadDividerLabel(unreadDivider!.count)}</span>
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
