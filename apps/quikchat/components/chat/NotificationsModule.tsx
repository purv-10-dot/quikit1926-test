"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChannelList,
  ChannelListItem,
  Mention,
  MentionRefInput,
  MessageDto,
  NotificationDto,
  NotificationType,
} from "@/lib/shared";
import {
  AtSign,
  Avatar,
  Bell,
  Button,
  Check,
  EyeOff,
  Heart,
  IconButton,
  Menu,
  MenuItem,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Popover,
  Reply,
  Search,
  Settings,
  Tag,
  Trash2,
  useToast,
} from "@/components/ui";
import { fetchChannels, fetchMessages, markChannelReadApi, sendMessage } from "@/lib/api";
import {
  bumpChannelList,
  makeTempId,
  mergeMessageEvent,
  seedFromApiPage,
} from "@/lib/realtime-cache";
import { actorName, channelLabel, metaOf, relativeTime, summaryText } from "@/lib/notif-format";
import { useNotifications } from "@/components/notifications/NotificationProvider";
import { ApprovalsSection } from "./ApprovalsSection";
import { ConversationView } from "./ConversationView";

const TYPE_ICON: Record<NotificationType, ReactNode> = {
  mention: <AtSign size={10} />,
  dm: <MessageCircle size={10} />,
  keyword: <Tag size={10} />,
  reaction: <Heart size={10} />,
  thread_reply: <Reply size={10} />,
};

/** Actor profile photo, if the notification meta carries one. */
function actorAvatar(n: NotificationDto): string | undefined {
  return (metaOf(n) as { avatarUrl?: string }).avatarUrl || undefined;
}

type Filter = "all" | "unread" | "mention";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "mention", label: "@Mentions" },
];

export interface NotificationsModuleProps {
  /** Viewer id — needed to render the conversation in the right panel. */
  currentUserId: string;
  /** Open the notification settings surface (wired by the shell). */
  onOpenSettings?: () => void;
}

function lastMessageOf(dto: MessageDto) {
  return {
    id: dto.id,
    type: dto.type,
    content: dto.content,
    senderId: dto.senderId,
    createdAt: dto.createdAt,
  };
}

export function NotificationsModule({ currentUserId, onOpenSettings }: NotificationsModuleProps) {
  const qc = useQueryClient();
  const toast = useToast();
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
    requestOsPermission,
  } = useNotifications();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Session-local hide only — there is no per-notification delete endpoint
  // server-side (only bulk clear-all). A real delete is a backlog item.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const hideOne = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await clearAll();
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter((n) => {
      if (hiddenIds.has(n.id)) return false;
      if (filter === "unread" && n.isRead) return false;
      if (filter === "mention" && n.type !== "mention") return false;
      if (q) {
        const hay =
          `${actorName(n)} ${summaryText(n)} ${n.preview ?? ""} ${channelLabel(n)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [feed, filter, query, hiddenIds]);

  const selected = useMemo(
    () => visible.find((n) => n.id === selectedId) ?? feed.find((n) => n.id === selectedId) ?? null,
    [visible, feed, selectedId],
  );

  // Right panel renders the real conversation for the selected notification.
  const activeChannelId = selected?.channelId ?? null;
  const channelsQuery = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });
  const messagesQuery = useQuery({
    queryKey: ["messages", activeChannelId],
    queryFn: async () => seedFromApiPage(await fetchMessages(activeChannelId!)),
    enabled: !!activeChannelId,
  });
  const activeChannel: ChannelListItem | undefined = useMemo(() => {
    const data = channelsQuery.data;
    if (!data || !activeChannelId) return undefined;
    return [...data.priority, ...data.recent].find((c) => c.channelId === activeChannelId);
  }, [channelsQuery.data, activeChannelId]);

  const onOpenRow = (n: NotificationDto) => {
    setSelectedId(n.id);
    if (!n.isRead) void markRead([n.id]);
    if (n.channelId) void markChannelReadApi(n.channelId).catch(() => undefined);
  };

  // Send a message from the inlined conversation (optimistic + reconcile).
  const handleSend = useCallback(
    (content: string, mentionRefs: MentionRefInput[], parentMessageId?: string) => {
      if (!activeChannel) return;
      const channelId = activeChannel.channelId;
      const nameById = new Map(activeChannel.members.map((m) => [m.id, m.displayName]));
      const mentions: Mention[] = mentionRefs.map((r) => ({
        userId: r.userId,
        displayName: r.userId === "everyone" ? "everyone" : (nameById.get(r.userId) ?? "unknown"),
        offsetStart: r.offsetStart,
        offsetEnd: r.offsetEnd,
      }));
      const clientMessageId = crypto.randomUUID();
      const optimistic: MessageDto = {
        id: makeTempId(),
        channelId,
        senderId: currentUserId,
        actorType: "human",
        type: "Text",
        content,
        data: null,
        parentMessageId: parentMessageId ?? null,
        parentPreview: null,
        isPinned: false,
        reactions: [],
        mentions,
        clientMessageId,
        createdAt: new Date().toISOString(),
        editedAt: null,
      };
      qc.setQueryData<MessageDto[]>(["messages", channelId], (old) => [...(old ?? []), optimistic]);
      sendMessage(channelId, { content, mentions: mentionRefs, parentMessageId, clientMessageId })
        .then((server) => {
          qc.setQueryData<MessageDto[]>(["messages", channelId], (old) =>
            mergeMessageEvent(old ?? [], server, currentUserId),
          );
          qc.setQueryData<ChannelList>(["channels"], (old) =>
            old
              ? bumpChannelList(old, channelId, lastMessageOf(server), {
                  active: true,
                  fromSelf: true,
                })
              : old,
          );
        })
        .catch(() => {
          qc.setQueryData<MessageDto[]>(["messages", channelId], (old) =>
            (old ?? []).filter((m) => m.id !== optimistic.id),
          );
          toast.error({
            title: "Couldn't send",
            body: "Your message wasn't delivered — try again.",
          });
        });
    },
    [activeChannel, currentUserId, qc, toast],
  );

  return (
    <div className="qc-card">
      <div className="qc-panes qc-act" data-view={selected ? "convo" : "list"}>
        <aside className="qc-pane-list qc-act-list">
          <div className="qc-act-head">
            <h1 className="qc-act-title">Activity</h1>
            {confirmingClear ? (
              <div className="qc-act-head__confirm">
                <span className="qc-act-head__confirm-text">Clear all notifications?</span>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingClear(false)}
                  disabled={clearing}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void handleClearAll()}
                  disabled={clearing}
                  data-testid="confirm-clear-all"
                >
                  {clearing ? "Clearing…" : "Confirm"}
                </Button>
              </div>
            ) : (
              <div className="qc-act-head__actions">
                <button
                  type="button"
                  className="qc-link"
                  disabled={unreadCount === 0}
                  onClick={() => void markAllRead()}
                >
                  Mark all read
                </button>
                <Popover
                  open={headerMenuOpen}
                  onOpenChange={setHeaderMenuOpen}
                  placement="bottom"
                  label="More activity actions"
                  trigger={
                    <IconButton label="More activity actions" className="qc-act-headmenu">
                      <MoreHorizontal size={16} />
                    </IconButton>
                  }
                >
                  <Menu label="Activity actions">
                    <MenuItem
                      icon={<Trash2 size={14} />}
                      danger
                      onSelect={() => {
                        setHeaderMenuOpen(false);
                        setConfirmingClear(true);
                      }}
                    >
                      Clear all
                    </MenuItem>
                  </Menu>
                </Popover>
                <IconButton label="Notification settings" onClick={() => onOpenSettings?.()}>
                  <Settings size={16} />
                </IconButton>
              </div>
            )}
          </div>

          {/*
            Above the search and the filter chips, deliberately. Those belong to
            the notification feed — putting approvals below them would imply the
            filters apply here too, and "Unread"/"@Mentions" mean nothing for a
            parked write. Self-hides when there is nothing, so it costs no space
            on the turns that never produce one, and scroll-caps in CSS so a long
            ledger cannot push the feed off screen.
          */}
          <ApprovalsSection currentUserId={currentUserId} />

          <div className="qc-act-search">
            <Search size={15} aria-hidden />
            <input
              className="qc-input"
              placeholder="Search"
              aria-label="Search activity"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="qc-act-filters" role="tablist" aria-label="Filter activity">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                data-active={filter === f.key}
                className="qc-act-chip"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {osPermission === "default" ? (
            <div className="qc-osbanner qc-act-osbanner">
              <Bell size={16} aria-hidden />
              <span className="qc-osbanner__text">
                Turn on desktop notifications so you don&apos;t miss mentions.
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

          <div className="qc-act-scroll" data-testid="activity-feed">
            {visible.length === 0 ? (
              <div className="qc-nempty">
                <Bell size={26} aria-hidden />
                <div className="qc-nempty__title">You&apos;re all caught up</div>
                <div className="qc-nempty__hint">
                  New mentions, DMs and keyword hits show up here.
                </div>
              </div>
            ) : (
              visible.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  className="qc-chan-row qc-act-row"
                  data-unread={!n.isRead}
                  data-active={n.id === selectedId}
                  data-menuopen={menuOpenId === n.id}
                  onClick={() => onOpenRow(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenRow(n);
                    }
                  }}
                >
                  <span className="qc-ntype">
                    <Avatar
                      name={actorName(n)}
                      id={n.actorId ?? undefined}
                      avatarUrl={actorAvatar(n)}
                      size={36}
                    />
                    <span className="qc-ntype__badge" aria-hidden>
                      {TYPE_ICON[n.type]}
                    </span>
                  </span>
                  <span className="qc-chan-main">
                    <span className="qc-chan-toprow">
                      <span className="qc-chan-name">{actorName(n)}</span>
                      <span
                        className="qc-act-meta"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <span className="qc-chan-time">{relativeTime(n.createdAt)}</span>
                        <Popover
                          open={menuOpenId === n.id}
                          onOpenChange={(o) => setMenuOpenId(o ? n.id : null)}
                          placement="bottom"
                          label="Notification actions"
                          trigger={
                            <IconButton label="More actions" className="qc-act-rowmenu">
                              <MoreHorizontal size={16} />
                            </IconButton>
                          }
                        >
                          <Menu label="Notification actions">
                            <MenuItem
                              icon={<Check size={14} />}
                              onSelect={() => {
                                if (!n.isRead) void markRead([n.id]);
                                setMenuOpenId(null);
                              }}
                            >
                              Mark as read
                            </MenuItem>
                            <MenuItem
                              icon={<EyeOff size={14} />}
                              onSelect={() => {
                                hideOne(n.id);
                                setMenuOpenId(null);
                              }}
                            >
                              Hide
                            </MenuItem>
                          </Menu>
                        </Popover>
                      </span>
                    </span>
                    <span className="qc-chan-botrow">
                      <span className="qc-chan-preview">
                        {summaryText(n)}
                        {n.preview ? ` — ${n.preview}` : ""}
                      </span>
                      {!n.isRead ? <span className="qc-nrow__dot" aria-label="unread" /> : null}
                    </span>
                  </span>
                </div>
              ))
            )}

            {hasMore ? (
              <div className="qc-act-foot">
                <button
                  type="button"
                  className="qc-link"
                  disabled={loading}
                  onClick={() => void loadMore()}
                >
                  {loading ? "Loading…" : "See all activity"}
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        {activeChannel ? (
          <ConversationView
            key={activeChannel.channelId}
            channel={activeChannel}
            currentUserId={currentUserId}
            messages={messagesQuery.data}
            loadingMessages={messagesQuery.isLoading}
            channels={channelsQuery.data}
            onSend={handleSend}
          />
        ) : (
          <section className="qc-pane-convo qc-act-detail">
            <div className="qc-act-detail__empty">
              <MessageSquare size={28} />
              <div className="qc-act-detail__empty-title">
                {selected ? "Opening conversation…" : "Select an activity"}
              </div>
              <div className="qc-act-detail__empty-hint">
                {selected
                  ? "This notification isn't linked to a conversation."
                  : "Choose a notification on the left to open the conversation here."}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
