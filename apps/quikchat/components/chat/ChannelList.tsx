"use client";

import { useMemo, useState } from "react";
import type { ChannelList as ChannelListData, ChannelListItem } from "@/lib/shared";
import {
  Avatar,
  Badge,
  EmptyState,
  Hash,
  IconButton,
  Plus,
  Search,
  SearchInput,
  Spinner,
  Users,
} from "@/components/ui";
import { formatChannelTime } from "@/lib/format";
import { messagePreview } from "@/lib/preview";

/** Conversation-list filters surfaced by the email-style nav row. */
export type ListFilter = "all" | "unread" | "dm" | "group" | "pinned";

function ChannelRow({
  item,
  active,
  online,
  onPick,
}: {
  item: ChannelListItem;
  active: boolean;
  online?: boolean;
  onPick: (id: string) => void;
}) {
  const preview = messagePreview(item.lastMessage);
  const unread = item.unreadCount > 0;
  return (
    <button
      type="button"
      className="qc-chan-row"
      data-active={active}
      data-unread={unread}
      onClick={() => onPick(item.channelId)}
    >
      <Avatar
        name={item.name ?? "Conversation"}
        id={item.channelId}
        avatarUrl={item.avatarUrl}
        group={item.type === "group"}
        size={36}
        online={online}
      />
      <span className="qc-chan-main">
        <span className="qc-chan-toprow">
          <span className="qc-chan-name">{item.name ?? "Direct message"}</span>
          <span className="qc-chan-time">{formatChannelTime(item.lastActivityAt)}</span>
        </span>
        <span className="qc-chan-botrow">
          <span className="qc-chan-preview">{preview.text}</span>
          {unread ? <Badge count={item.unreadCount} /> : null}
        </span>
      </span>
    </button>
  );
}

function filterByName(items: ChannelListItem[], q: string): ChannelListItem[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((c) => (c.name ?? "").toLowerCase().includes(needle));
}

export interface ChannelListProps {
  data?: ChannelListData;
  loading?: boolean;
  workspaceName: string;
  activeChannelId?: string | null;
  /** Viewer id — excluded when deciding if a DM's other member is online. */
  currentUserId?: string;
  /** User ids currently online (shared-channel presence). */
  onlineUserIds?: ReadonlySet<string>;
  /** Controlled filter from the email-style nav row. Uncontrolled all/unread segment when omitted. */
  filter?: ListFilter;
  /** Hide the legacy header + all/unread segment (controls moved to the card nav row). */
  chromeless?: boolean;
  onPick: (id: string) => void;
  onNewChat?: () => void;
  onNewGroup?: () => void;
  onDiscover?: () => void;
}

function matchesType(item: ChannelListItem, filter: ListFilter): boolean {
  switch (filter) {
    case "unread":
      return item.unreadCount > 0;
    case "dm":
      return item.type === "dm";
    case "group":
      return item.type === "group";
    default:
      return true;
  }
}

export function ChannelList({
  data,
  loading,
  workspaceName,
  activeChannelId,
  currentUserId,
  onlineUserIds,
  filter,
  chromeless,
  onPick,
  onNewChat,
  onNewGroup,
  onDiscover,
}: ChannelListProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [internalFilter, setInternalFilter] = useState<ListFilter>("all");
  const effectiveFilter: ListFilter = filter ?? internalFilter;

  // DM rows get a presence dot when the other participant is online. Group rows
  // show a channel glyph, not a person, so they never carry a dot.
  const dmOnline = (item: ChannelListItem): boolean | undefined => {
    if (!onlineUserIds || item.type === "group") return undefined;
    return item.members.some((m) => m.id !== currentUserId && onlineUserIds.has(m.id));
  };

  const filtered = (items: ChannelListItem[]) =>
    filterByName(items, query).filter((c) => matchesType(c, effectiveFilter));
  const priority = useMemo(
    () => filtered(data?.priority ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, query, effectiveFilter],
  );
  const recent = useMemo(
    () => filtered(data?.recent ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, query, effectiveFilter],
  );
  const totalCount = (data?.priority.length ?? 0) + (data?.recent.length ?? 0);
  const isEmpty = !loading && totalCount === 0;
  // "Pinned" filter collapses the list to just the pinned section.
  const showRecent = effectiveFilter !== "pinned";
  const chromelessEmpty = priority.length + recent.length === 0;

  const renderRow = (item: ChannelListItem) => (
    <ChannelRow
      key={item.channelId}
      item={item}
      active={item.channelId === activeChannelId}
      online={dmOnline(item)}
      onPick={onPick}
    />
  );

  return (
    <nav className="qc-pane-list" aria-label="Conversations">
      {chromeless ? (
        <div className="qc-list-head qc-list-head--inbox">
          <div className="qc-inbox-title">
            <h2 className="qc-inbox-h">Messages</h2>
          </div>
          <span style={{ display: "flex", gap: 2 }}>
            <IconButton
              label={searchOpen ? "Hide search" : "Search"}
              onClick={() =>
                setSearchOpen((open) => {
                  if (open) setQuery("");
                  return !open;
                })
              }
            >
              <Search size={16} />
            </IconButton>
            <IconButton label="New group" onClick={onNewGroup} disabled={!onNewGroup}>
              <Users size={16} />
            </IconButton>
            <IconButton label="New direct message" onClick={onNewChat} disabled={!onNewChat}>
              <Plus size={16} />
            </IconButton>
          </span>
        </div>
      ) : (
        <div className="qc-list-head">
          <span style={{ fontWeight: 500 }}>{workspaceName}</span>
          <span style={{ display: "flex", gap: 2 }}>
            <IconButton label="Discover channels" onClick={onDiscover} disabled={!onDiscover}>
              <Hash size={16} />
            </IconButton>
            <IconButton label="New group" onClick={onNewGroup} disabled={!onNewGroup}>
              <Users size={16} />
            </IconButton>
            <IconButton label="New direct message" onClick={onNewChat} disabled={!onNewChat}>
              <Plus size={16} />
            </IconButton>
          </span>
        </div>
      )}
      <div className="qc-list-search">
        {!chromeless || searchOpen ? (
          <SearchInput
            placeholder="Search"
            aria-label="Search conversations"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
        ) : null}
        {chromeless ? (
          <div className="qc-segment" role="tablist" aria-label="Filter conversations">
            {(
              [
                ["all", "All"],
                ["unread", "Unread"],
                ["group", "Groups"],
                ["pinned", "Pinned"],
              ] as [ListFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={internalFilter === key}
                data-active={internalFilter === key}
                onClick={() => setInternalFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="qc-segment" role="tablist" aria-label="Filter conversations">
            <button
              type="button"
              role="tab"
              aria-selected={internalFilter === "all"}
              data-active={internalFilter === "all"}
              onClick={() => setInternalFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={internalFilter === "unread"}
              data-active={internalFilter === "unread"}
              onClick={() => setInternalFilter("unread")}
            >
              Unread
            </button>
          </div>
        )}
      </div>
      <div className="qc-list-scroll">
        {loading ? (
          <div style={{ padding: 16 }}>
            <Spinner />
          </div>
        ) : isEmpty ? (
          <EmptyState title="No conversations yet" hint="Start one to get going." />
        ) : chromeless ? (
          chromelessEmpty ? (
            <EmptyState title="Nothing here" hint="No conversations match this filter." />
          ) : (
            <>
              {priority.length > 0 ? (
                <>
                  <div className="qc-list-section qc-label">Pinned</div>
                  {priority.map(renderRow)}
                </>
              ) : null}
              {showRecent && recent.length > 0 ? (
                <>
                  <div className="qc-list-section qc-label">All messages</div>
                  {recent.map(renderRow)}
                </>
              ) : null}
            </>
          )
        ) : (
          <>
            {priority.length > 0 ? (
              <>
                <div className="qc-list-section qc-label">Pinned</div>
                {priority.map(renderRow)}
              </>
            ) : null}
            {recent.length > 0 ? (
              <>
                <div className="qc-list-section qc-label">Recent</div>
                {recent.map(renderRow)}
              </>
            ) : null}
          </>
        )}
      </div>
    </nav>
  );
}
