"use client";

import { useEffect, useRef } from "react";

const MEMBERS_CHANGED = "quiktrack:members-changed";

/**
 * Project membership changed (someone added/removed) — let open views refresh
 * their locally-cached member lists without a full page reload.
 *
 * Mirrors the existing `quiktrack:issue-*` window-event convention the board /
 * backlog views already use for cross-component refresh. The board, backlog,
 * timeline, list, task-table and grouped-kanban views each hold members in
 * local state fetched once on mount, so React Query invalidation alone can't
 * reach them — this event closes that gap.
 */
export function emitMembersChanged(projectId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MEMBERS_CHANGED, { detail: { projectId } }));
}

/** Run `onChange` whenever the given project's membership changes. The callback
 *  is kept in a ref so callers can pass an inline closure without resubscribing
 *  every render. */
export function useMembersChanged(projectId: string, onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    function handler(e: Event) {
      const id = (e as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (!id || id === projectId) cb.current();
    }
    window.addEventListener(MEMBERS_CHANGED, handler);
    return () => window.removeEventListener(MEMBERS_CHANGED, handler);
  }, [projectId]);
}
