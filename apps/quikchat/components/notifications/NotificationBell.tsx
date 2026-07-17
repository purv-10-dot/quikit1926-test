"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { NotificationDto, NotificationType } from "@/lib/shared";
import {
  AtSign,
  Avatar,
  Badge,
  Bell,
  Hash,
  Heart,
  IconButton,
  MessageCircle,
  Popover,
  Reply,
  Settings,
  Tag,
} from "@/components/ui";
import {
  actorName,
  channelLabel,
  groupFeed,
  relativeTime,
  summaryText,
} from "@/lib/notif-format";
import { useNotifications } from "./NotificationProvider";

const TYPE_ICON: Record<NotificationType, ReactNode> = {
  mention: <AtSign size={10} />,
  dm: <MessageCircle size={10} />,
  keyword: <Tag size={10} />,
  reaction: <Heart size={10} />,
  thread_reply: <Reply size={10} />,
};

function NotificationRow({
  n,
  onOpen,
}: {
  n: NotificationDto;
  onOpen: (n: NotificationDto) => void;
}) {
  return (
    <button type="button" className="qc-nrow" data-unread={!n.isRead} onClick={() => onOpen(n)}>
      <span className="qc-ntype">
        <Avatar name={actorName(n)} id={n.actorId ?? undefined} size={34} />
        <span className="qc-ntype__badge" aria-hidden>
          {TYPE_ICON[n.type]}
        </span>
      </span>
      <span className="qc-nrow__body">
        <span className="qc-nrow__line1">
          <b>{actorName(n)}</b> {summaryText(n)}
        </span>
        {n.preview ? <span className="qc-nrow__prev">{n.preview}</span> : null}
        <span className="qc-nrow__meta">
          {channelLabel(n)} · {relativeTime(n.createdAt)}
        </span>
      </span>
      {!n.isRead ? <span className="qc-nrow__dot" aria-label="unread" /> : null}
    </button>
  );
}

export interface NotificationBellProps {
  /** Open the notification settings surface (wired by the shell). */
  onOpenSettings?: () => void;
}

export function NotificationBell({ onOpenSettings }: NotificationBellProps) {
  const {
    feed,
    unreadCount,
    hasMore,
    loading,
    osPermission,
    markRead,
    markAllRead,
    clearAll,
    loadMore,
    openChannel,
    requestOsPermission,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");

  const visible = useMemo(
    () => (tab === "unread" ? feed.filter((n) => !n.isRead) : feed),
    [feed, tab],
  );
  const groups = useMemo(() => groupFeed(visible), [visible]);

  const onOpenRow = (n: NotificationDto) => {
    void markRead([n.id]);
    if (n.channelId) openChannel(n.channelId, n.messageId);
    setOpen(false);
  };

  const bell = (
    <IconButton label="Notifications" className="qc-bell">
      <Bell size={20} />
      {unreadCount > 0 ? (
        <span className="qc-bell__badge">
          <Badge count={unreadCount} />
        </span>
      ) : null}
    </IconButton>
  );

  return (
    <Popover
      trigger={bell}
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      label="Notifications"
    >
      <div className="qc-npanel">
        <div className="qc-npanel__head">
          <span className="qc-npanel__title">Notifications</span>
          <div className="qc-npanel__actions">
            <button type="button" className="qc-link" onClick={() => void markAllRead()}>
              Mark all read
            </button>
            <IconButton
              label="Notification settings"
              className="qc-npanel__gear"
              onClick={() => {
                setOpen(false);
                onOpenSettings?.();
              }}
            >
              <Settings size={16} />
            </IconButton>
          </div>
        </div>

        <div className="qc-ntabs" role="tablist" aria-label="Filter notifications">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "all"}
            className="qc-ntab"
            onClick={() => setTab("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "unread"}
            className="qc-ntab"
            onClick={() => setTab("unread")}
          >
            Unread
          </button>
        </div>

        {osPermission === "default" ? (
          <div className="qc-osbanner">
            <Bell size={16} aria-hidden />
            <span className="qc-osbanner__text">
              Turn on desktop notifications so you don&apos;t miss mentions when QuikChat isn&apos;t
              focused.
            </span>
            <button
              type="button"
              className="qc-btn qc-btn--primary qc-osbanner__btn"
              onClick={() => void requestOsPermission()}
            >
              Enable
            </button>
          </div>
        ) : null}

        <div className="qc-nfeed" data-testid="notification-feed">
          {visible.length === 0 ? (
            <div className="qc-nempty">
              <Bell size={26} aria-hidden />
              <div className="qc-nempty__title">You&apos;re all caught up</div>
              <div className="qc-nempty__hint">
                New mentions, DMs and keyword hits show up here.
              </div>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="qc-ngroup">
                <div className="qc-ngroup__head">
                  {g.isDm ? <MessageCircle size={13} /> : <Hash size={13} />}
                  {g.label} · {g.items.length}
                </div>
                {g.items.map((n) => (
                  <NotificationRow key={n.id} n={n} onOpen={onOpenRow} />
                ))}
              </div>
            ))
          )}
        </div>

        <div className="qc-npanel__foot">
          {hasMore ? (
            <button
              type="button"
              className="qc-link"
              disabled={loading}
              onClick={() => void loadMore()}
            >
              {loading ? "Loading…" : "See all activity"}
            </button>
          ) : feed.length > 0 ? (
            <button type="button" className="qc-link" onClick={() => void clearAll()}>
              Clear all
            </button>
          ) : null}
        </div>
      </div>
    </Popover>
  );
}
