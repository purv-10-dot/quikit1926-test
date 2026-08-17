"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MessageDto } from "@/lib/shared";
import { MESSAGES_PAGE_SIZE, fetchMessages } from "@/lib/api";
import { isTempId, prependOlder } from "@/lib/realtime-cache";

export interface OlderMessages {
  /** Request the next older page. Safe to call on every scroll event. */
  loadOlder: () => void;
  /** A page is in flight — drives the top loading affordance. */
  loadingOlder: boolean;
  /** The oldest message is loaded (or paging stopped); no further requests. */
  atEnd: boolean;
}

/**
 * Scroll-back pagination for the canonical `["messages", channelId]` cache.
 *
 * Writes straight into that cache with `prependOlder` rather than going through
 * `useInfiniteQuery`, deliberately. Two reasons:
 *
 *  1. The cache is a FLAT ascending `MessageDto[]` with ~12 writers across
 *     ChatWorkspace / ConversationView / NotificationsModule (optimistic send,
 *     media send, edit, delete, pin, reactions, `mergeMessageEvent`,
 *     `patchMessageEvent`). Reshaping it into infinite-query pages breaks all
 *     of them.
 *  2. MessageList's unread-divider resolution is gated on the messages query's
 *     `isFetching`. Paging through that query would flip the flag and perturb
 *     when — and against which array — the divider resolves.
 *
 * Fetching outside React Query keeps both invariants intact.
 */
export function useOlderMessages(channelId: string | null | undefined): OlderMessages {
  const qc = useQueryClient();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  // A ref, not state: the guard has to be set synchronously before the first
  // `await`, or a burst of scroll events all pass the check in the same tick
  // and fire duplicate requests for the same cursor.
  const inFlightRef = useRef(false);

  // Reset when switching conversations — `atEnd` is per-channel, and a stale
  // `true` would leave the new channel unable to page at all.
  useEffect(() => {
    inFlightRef.current = false;
    setLoadingOlder(false);
    setAtEnd(false);
  }, [channelId]);

  const loadOlder = useCallback(() => {
    if (!channelId || inFlightRef.current || atEnd) return;

    const existing = qc.getQueryData<MessageDto[]>(["messages", channelId]) ?? [];
    // The cursor must be a PERSISTED id — an optimistic `temp-*` row is unknown
    // to the server and would now take the 400 path. Temp rows only ever sit at
    // the newest end, so this normally picks `existing[0]`.
    const oldest = existing.find((m) => !isTempId(m.id));
    if (!oldest) return;

    inFlightRef.current = true;
    setLoadingOlder(true);
    void fetchMessages(channelId, oldest.id)
      .then((page) => {
        // A short page means the server had nothing more to give. Length is the
        // only reliable signal: "prependOlder returned the same array" would
        // also be true when every row was already cached, which is not the same
        // thing as reaching the start of history.
        if (page.length < MESSAGES_PAGE_SIZE) setAtEnd(true);
        if (page.length > 0) {
          qc.setQueryData<MessageDto[]>(["messages", channelId], (old) =>
            prependOlder(old ?? [], page),
          );
        }
      })
      .catch(() => {
        // Latch on failure too. An endless retry loop at the top of every
        // conversation is a worse bug than the one this fixes, and a persistent
        // error (a 400 from a bad cursor, say) would otherwise re-fire on every
        // scroll event. Recovery is switching channels, which resets the hook.
        setAtEnd(true);
      })
      .finally(() => {
        inFlightRef.current = false;
        setLoadingOlder(false);
      });
  }, [channelId, qc, atEnd]);

  return { loadOlder, loadingOlder, atEnd };
}
