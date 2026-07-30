"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NotificationDto, NotificationRealtimePayload } from "@/lib/shared";
import { Avatar, useToast } from "@/components/ui";
import {
  clearNotificationsApi,
  fetchNotifications,
  fetchUnreadByChannel,
  fetchUnreadCount,
  markAllNotificationsReadApi,
  markChannelNotificationsReadApi,
  markNotificationsReadApi,
} from "@/lib/api";
import { actorName, channelLabel, fullSummary, summaryText } from "@/lib/notif-format";
import {
  appendPage,
  applyInbound,
  clearAllLocal,
  emptyNotifState,
  markAllReadLocal,
  markChannelReadLocal,
  markReadLocal,
  reconcileCount,
  seed,
  type NotifState,
} from "@/lib/notif-store";
import { playNotificationSound } from "@/lib/notification-sound";
import {
  fireOsNotification,
  isAppFocused,
  permissionState,
  requestPermission,
  shouldFireOsNotification,
  type NotificationPermissionState,
} from "@/lib/web-notifications";

const PAGE = 30;

/** Minimal realtime client surface the provider needs (subset of RealtimeClient). */
export interface NotifRealtimeClient {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler?: (...args: unknown[]) => void): void;
}

export interface NotificationContextValue {
  feed: NotificationDto[];
  unreadCount: number;
  byChannel: Record<string, number>;
  hasMore: boolean;
  loading: boolean;
  osPermission: NotificationPermissionState;
  markRead(ids: string[]): Promise<void>;
  markAllRead(): Promise<void>;
  markChannelRead(channelId: string): Promise<void>;
  clearAll(): Promise<void>;
  loadMore(): Promise<void>;
  /** Open a channel from a feed row / toast / OS click (jumps via the registered opener). */
  openChannel(channelId: string | null, messageId?: string | null): void;
  /** Request OS-notification permission (call from a user gesture only). */
  requestOsPermission(): Promise<void>;
  // --- wiring (no-ops without a provider) ---
  attachClient(client: NotifRealtimeClient | null): void;
  registerChannelOpener(fn: (channelId: string, messageId?: string | null) => void): void;
}

const noopAsync = async () => undefined;
const defaultValue: NotificationContextValue = {
  feed: [],
  unreadCount: 0,
  byChannel: {},
  hasMore: false,
  loading: false,
  osPermission: "default",
  markRead: noopAsync,
  markAllRead: noopAsync,
  markChannelRead: noopAsync,
  clearAll: noopAsync,
  loadMore: noopAsync,
  openChannel: () => undefined,
  requestOsPermission: noopAsync,
  attachClient: () => undefined,
  registerChannelOpener: () => undefined,
};

const NotificationContext = createContext<NotificationContextValue>(defaultValue);

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [state, setState] = useState<NotifState>(emptyNotifState);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [osPermission, setOsPermission] = useState<NotificationPermissionState>("default");

  const openerRef = useRef<((channelId: string, messageId?: string | null) => void) | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const openChannel = useCallback((channelId: string | null, messageId?: string | null) => {
    if (!channelId) return;
    openerRef.current?.(channelId, messageId);
  }, []);

  const registerChannelOpener = useCallback(
    (fn: (channelId: string, messageId?: string | null) => void) => {
      openerRef.current = fn;
    },
    [],
  );

  // ---- inbound realtime event ----
  const handleInbound = useCallback(
    (payload: NotificationRealtimePayload) => {
      if (!payload?.id) return;
      // `desktop` / `sound` are transient alert flags, not part of the row —
      // strip both so neither leaks into the stored DTO or the bell feed.
      const { desktop, sound, ...dto } = payload;
      const n = dto as NotificationDto;
      setState((s) => applyInbound(s, n));

      if (isAppFocused()) {
        // In-app toast for a genuinely new (unread) notification.
        if (!n.isRead) {
          // Audible cue for the toast. Only when focused: an unfocused tab gets
          // the OS notification below, which brings its own sound — playing here
          // too would double up.
          if (sound) playNotificationSound();
          toast.info({
            icon: <Avatar name={actorName(n)} id={n.actorId ?? undefined} size={32} />,
            title: (
              <span>
                <b>{actorName(n)}</b> {summaryText(n)}
                {n.channelId ? (
                  <>
                    {" in "}
                    <b>{channelLabel(n)}</b>
                  </>
                ) : null}
              </span>
            ),
            body: n.preview || undefined,
            onClick: () => openChannel(n.channelId, n.messageId),
          });
        }
      } else if (shouldFireOsNotification(desktop)) {
        fireOsNotification({
          title: `QuikChat — ${channelLabel(n)}`,
          body: [fullSummary(n), n.preview].filter(Boolean).join(" — "),
          tag: n.channelId ?? n.id,
          onClick: () => openChannel(n.channelId, n.messageId),
        });
      }
    },
    [toast, openChannel],
  );
  const handleInboundRef = useRef(handleInbound);
  handleInboundRef.current = handleInbound;

  const attachClient = useCallback((client: NotifRealtimeClient | null) => {
    if (!client) return;
    const listener = (payload: unknown) =>
      handleInboundRef.current(payload as NotificationRealtimePayload);
    client.on("notification", listener);
    // Best-effort detach is handled by the client's own teardown (disconnect);
    // we keep a single subscription per attached client.
  }, []);

  // ---- seed on mount ----
  useEffect(() => {
    let alive = true;
    setOsPermission(permissionState());
    void (async () => {
      try {
        const [page, byCh] = await Promise.all([
          fetchNotifications({ limit: PAGE }),
          fetchUnreadByChannel().catch(() => ({ byChannel: {}, total: 0 })),
        ]);
        if (!alive) return;
        setState(seed(page.items, page.unreadCount, byCh.byChannel));
        setHasMore(page.items.length >= PAGE);
      } catch {
        // Best-effort: a failed seed leaves an empty bell; realtime still works.
        try {
          const { count } = await fetchUnreadCount();
          if (alive) setState((s) => reconcileCount(s, count));
        } catch {
          // ignore
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---- actions ----
  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    setState((s) => markReadLocal(s, ids));
    try {
      const { unreadCount } = await markNotificationsReadApi(ids);
      setState((s) => reconcileCount(s, unreadCount));
    } catch {
      // optimistic state stands
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setState(markAllReadLocal);
    try {
      const { unreadCount } = await markAllNotificationsReadApi();
      setState((s) => reconcileCount(s, unreadCount));
    } catch {
      // ignore
    }
  }, []);

  const markChannelRead = useCallback(async (channelId: string) => {
    if (!channelId) return;
    setState((s) => markChannelReadLocal(s, channelId));
    try {
      const { unreadCount } = await markChannelNotificationsReadApi(channelId);
      setState((s) => reconcileCount(s, unreadCount));
    } catch {
      // ignore
    }
  }, []);

  const clearAll = useCallback(async () => {
    setState(clearAllLocal());
    setHasMore(false);
    try {
      await clearNotificationsApi();
    } catch {
      // ignore
    }
  }, []);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (!current.feed.length) return;
    const before = current.feed[current.feed.length - 1]!.id;
    setLoading(true);
    try {
      const page = await fetchNotifications({ limit: PAGE, before });
      setState((s) => appendPage(s, page.items));
      setHasMore(page.items.length >= PAGE);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const requestOsPermission = useCallback(async () => {
    const result = await requestPermission();
    setOsPermission(result);
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      feed: state.feed,
      unreadCount: state.unreadCount,
      byChannel: state.byChannel,
      hasMore,
      loading,
      osPermission,
      markRead,
      markAllRead,
      markChannelRead,
      clearAll,
      loadMore,
      openChannel,
      requestOsPermission,
      attachClient,
      registerChannelOpener,
    }),
    [
      state,
      hasMore,
      loading,
      osPermission,
      markRead,
      markAllRead,
      markChannelRead,
      clearAll,
      loadMore,
      openChannel,
      requestOsPermission,
      attachClient,
      registerChannelOpener,
    ],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
