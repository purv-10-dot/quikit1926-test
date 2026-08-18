"use client";

import { useEffect, useRef } from "react";
import { useNotifications } from "@/components/notifications/NotificationProvider";

/**
 * Web-side half of the desktop integration. Runs ONLY inside the QuikChat
 * Electron shell (where the preload defines `window.electron`); a completely
 * inert no-op in a normal browser, where `window.electron` is `undefined`.
 *
 * Must be mounted inside <NotificationProvider> — it reads `useNotifications()`.
 * Renders nothing.
 *
 * Responsibilities:
 *  - mirror the server-reconciled unread count to the OS taskbar/dock badge
 *  - route `quikchat://…` deep links to the right channel / invite
 */
export function DesktopBridge() {
  const { unreadCount, openChannel, openNewChat } = useNotifications();

  // Keep the deep-link effect mount-once: it reads the latest `openChannel`
  // through this ref instead of listing it in deps (which would resubscribe
  // on every render).
  const openChannelRef = useRef(openChannel);
  openChannelRef.current = openChannel;
  const openNewChatRef = useRef(openNewChat);
  openNewChatRef.current = openNewChat;

  // Badge sync: push the authoritative unread count to the shell whenever it
  // changes. Guarded so it is a no-op on web.
  useEffect(() => {
    const el = typeof window !== "undefined" ? window.electron : undefined;
    if (!el?.isElectron) return;
    void el.unread?.set(unreadCount);
  }, [unreadCount]);

  // Deep links: subscribe once. `onUrl` fires only for `quikchat://…` and
  // returns its own unsubscribe fn.
  useEffect(() => {
    const el = typeof window !== "undefined" ? window.electron : undefined;
    if (!el?.isElectron || !el.deepLinks) return;

    const handleUrl = (url: string) => {
      try {
        const u = new URL(url); // quikchat://<verb>/<rest>
        const verb = u.host; // the host segment carries the verb
        const rest = u.pathname.replace(/^\/+/, "");

        if (verb === "open" && rest) {
          openChannelRef.current(decodeURIComponent(rest));
        } else if (verb === "new-chat") {
          // ChatWorkspace registers the opener (its `newChatOpen` state is
          // local); this is a no-op if the workspace isn't mounted, which is
          // the same contract as `openChannel` above.
          openNewChatRef.current();
        } else if (verb === "invite" && rest) {
          window.location.assign("/invite/" + encodeURIComponent(decodeURIComponent(rest)));
        }
        // unknown verb → ignore
      } catch {
        // malformed url → ignore
      }
    };

    const off = el.deepLinks.onUrl(handleUrl);
    return off;
  }, []);

  return null;
}
