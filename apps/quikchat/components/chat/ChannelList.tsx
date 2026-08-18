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
  Sparkles,
  Spinner,
} from "@/components/ui";
import { formatChannelTime } from "@/lib/format";
import { messagePreview } from "@/lib/preview";
import type { EffectiveStatus } from "@/lib/presence-store";

/** Conversation-list filters surfaced by the email-style nav row. */
export type ListFilter = "all" | "unread" | "dm" | "channel" | "group" | "pinned";

/**
 * The three things a row can be, in the vocabulary users see.
 *
 * NOT derivable from `type` alone — and that is the whole subtlety of this
 * change. A `group` row is a **Channel** when it is public and a **Group** when
 * it is private, so every place that used to switch on `type === "group"` now
 * needs `visibility` too. `type` stays untouched in the database; this is
 * presentation over the existing two columns, per the backlog decision.
 */
export type ChannelKind = "channel" | "group" | "dm";

export function kindOf(item: Pick<ChannelListItem, "type" | "visibility">): ChannelKind {
  if (item.type !== "group") return "dm";
  return item.visibility === "public" ? "channel" : "group";
}

/**
 * `ChannelKind` → `Avatar`'s variant. Only "dm" needs translating: the list
 * calls it a DM, the avatar calls it a person.
 */
export function avatarVariantFor(
  item: Pick<ChannelListItem, "type" | "visibility">,
): "person" | "group" | "channel" {
  const kind = kindOf(item);
  return kind === "dm" ? "person" : kind;
}

function ChannelRow({
  item,
  active,
  online,
  status,
  onPick,
}: {
  item: ChannelListItem;
  active: boolean;
  online?: boolean;
  status?: EffectiveStatus;
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
        variant={avatarVariantFor(item)}
        size={36}
        online={online}
        status={status}
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

const SECTIONS: ReadonlyArray<{ key: ChannelKind; title: string }> = [
  { key: "channel", title: "Channels" },
  { key: "group", title: "Groups" },
  { key: "dm", title: "Direct Messages" },
];

/**
 * Per-section empty copy.
 *
 * The Channels branch is the reason this is a component and not a string map.
 * Creating a public channel is gated on `Channel.Public:create`, which most
 * roles do not hold by default — so telling everyone to "create one" advertises
 * a button that is not there and an action the server will refuse. Without the
 * grant the copy explains how channels DO appear for them instead.
 */
function SectionEmpty({
  kind,
  canCreateChannel,
}: {
  kind: ChannelKind;
  canCreateChannel: boolean;
}) {
  if (kind === "channel") {
    return canCreateChannel ? (
      <p className="qc-list-empty">No channels yet — create one.</p>
    ) : (
      <p className="qc-list-empty">
        No channels yet. Channels you join or get added to will appear here.
      </p>
    );
  }
  if (kind === "group") {
    return <p className="qc-list-empty">No groups yet — create one.</p>;
  }
  return <p className="qc-list-empty">No direct messages yet.</p>;
}

function filterByName(items: ChannelListItem[], q: string): ChannelListItem[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((c) => (c.name ?? "").toLowerCase().includes(needle));
}

export interface ChannelListProps {
  data?: ChannelListData;
  loading?: boolean;
  activeChannelId?: string | null;
  /** Viewer id — excluded when deciding if a DM's other member is online. */
  currentUserId?: string;
  /** User ids currently online (shared-channel presence). */
  onlineUserIds?: ReadonlySet<string>;
  /** Effective presence status accessor (rich status dot). Falls back to online-only. */
  statusOf?: (userId: string) => EffectiveStatus;
  /** Controlled filter from the nav row. Falls back to the internal segment when omitted. */
  filter?: ListFilter;
  onPick: (id: string) => void;
  onNewChat?: () => void;
  onNewGroup?: () => void;
  /** Open the create-CHANNEL flow (public). Omit when the viewer may not. */
  onNewChannel?: () => void;
  /**
   * Does the viewer hold `Channel.Public:create`?
   *
   * Drives BOTH the Channels section's `+` and its empty-state copy. The old
   * design assumed everyone could create, so the empty state advised an action
   * most users could not take — the `+` was there, they clicked it, and the
   * server 403'd. Defaults to false: a missing permission prop must not grant.
   */
  canCreateChannel?: boolean;
  onDiscover?: () => void;
  /** Open (find-or-create) the caller's AI-chat singleton. */
  onOpenAiChat?: () => void;
}

function matchesType(item: ChannelListItem, filter: ListFilter): boolean {
  switch (filter) {
    case "unread":
      return item.unreadCount > 0;
    case "dm":
      return kindOf(item) === "dm";
    // Both of these used to be one `type === "group"` branch, which lumped
    // public channels in with private groups.
    case "channel":
      return kindOf(item) === "channel";
    case "group":
      return kindOf(item) === "group";
    default:
      return true;
  }
}

export function ChannelList({
  data,
  loading,
  activeChannelId,
  currentUserId,
  onlineUserIds,
  statusOf,
  filter,
  onPick,
  onNewChat,
  onNewGroup,
  onNewChannel,
  canCreateChannel = false,
  onDiscover,
  onOpenAiChat,
}: ChannelListProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [internalFilter, setInternalFilter] = useState<ListFilter>("all");
  const [collapsed, setCollapsed] = useState<ReadonlySet<ChannelKind>>(new Set());
  const toggleSection = (key: ChannelKind) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const effectiveFilter: ListFilter = filter ?? internalFilter;

  // DM rows get a presence dot for the other participant. Group rows show a
  // channel glyph, not a person, so they never carry a dot.
  const dmOnline = (item: ChannelListItem): boolean | undefined => {
    if (!onlineUserIds || item.type === "group") return undefined;
    return item.members.some((m) => m.id !== currentUserId && onlineUserIds.has(m.id));
  };
  // Rich status for the DM's other member (wins over the boolean when available).
  const dmStatus = (item: ChannelListItem): EffectiveStatus | undefined => {
    if (!statusOf || item.type === "group") return undefined;
    const other = item.members.find((m) => m.id !== currentUserId);
    return other ? statusOf(other.id) : undefined;
  };

  // Pinned first, then recent — the section grouping is orthogonal to that
  // ordering, so it is preserved WITHIN each section rather than replaced.
  const visible = useMemo(() => {
    const all = [...(data?.priority ?? []), ...(data?.recent ?? [])];
    return filterByName(all, query).filter((c) => matchesType(c, effectiveFilter));
  }, [data, query, effectiveFilter]);

  const byKind = useMemo(
    () => ({
      channel: visible.filter((c) => kindOf(c) === "channel"),
      group: visible.filter((c) => kindOf(c) === "group"),
      dm: visible.filter((c) => kindOf(c) === "dm"),
    }),
    [visible],
  );

  /** Nothing left after the active filter — distinct from "no conversations at all". */
  const filteredEmpty = visible.length === 0;
  const filterActive = effectiveFilter !== "all";

  const renderRow = (item: ChannelListItem) => (
    <ChannelRow
      key={item.channelId}
      item={item}
      active={item.channelId === activeChannelId}
      online={dmOnline(item)}
      status={dmStatus(item)}
      onPick={onPick}
    />
  );

  return (
    <nav className="qc-pane-list" aria-label="Conversations">
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
          <IconButton label="AI Chat" onClick={onOpenAiChat} disabled={!onOpenAiChat}>
            <Sparkles size={16} />
          </IconButton>
          {/* Creation moved INTO the section headers below — each of Channels /
              Groups / Direct Messages owns its own `+`, and the Channels one is
              permission-conditional. A second set here would duplicate them and
              put the ungated `+` back on screen for users without the grant. */}
          <IconButton label="Discover channels" onClick={onDiscover} disabled={!onDiscover}>
            <Hash size={16} />
          </IconButton>
        </span>
      </div>
      <div className="qc-list-search">
        {searchOpen ? (
          <SearchInput
            placeholder="Search"
            aria-label="Search conversations"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
        ) : null}
        <div className="qc-segment" role="tablist" aria-label="Filter conversations">
          {(
            [
              ["all", "All"],
              ["unread", "Unread"],
              ["channel", "Channels"],
              ["group", "Groups"],
              // "dm" was implemented in matchesType and never offered as a chip
              // — an unreachable branch until now.
              ["dm", "Direct"],
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
      </div>
      <div className="qc-list-scroll">
        {filterActive && filteredEmpty && !loading ? (
          <EmptyState title="Nothing here" hint="No conversations match this filter." />
        ) : (
          // NOTE: no global "no conversations yet" branch. A brand-new user sees
          // the three sections with their own empty copy instead, because that
          // copy is what tells them what they can actually create — and for
          // Channels it is permission-conditional, which a single generic empty
          // state could never be.
          <>
            {SECTIONS.map(({ key, title }) => {
              const rows = byKind[key];
              const isCollapsed = collapsed.has(key);
              // The Channels `+` is the permission-conditional one. Groups and
              // DMs need only Channel:create / Channel.DM:create, which every
              // seeded role above Guest holds.
              const add =
                key === "channel"
                  ? canCreateChannel && onNewChannel
                    ? { label: "New channel", onClick: onNewChannel }
                    : null
                  : key === "group"
                    ? onNewGroup
                      ? { label: "New group", onClick: onNewGroup }
                      : null
                    : onNewChat
                      ? { label: "New direct message", onClick: onNewChat }
                      : null;

              return (
                <section key={key} className="qc-list-group" data-kind={key}>
                  <div className="qc-list-section qc-list-section--head">
                    <button
                      type="button"
                      className="qc-list-section__toggle"
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleSection(key)}
                    >
                      <span className="qc-list-section__chev" data-collapsed={isCollapsed}>
                        ›
                      </span>
                      <span className="qc-label">{title}</span>
                      <span className="qc-list-section__count">{rows.length}</span>
                    </button>
                    {add ? (
                      <IconButton label={add.label} onClick={add.onClick}>
                        <Plus size={14} />
                      </IconButton>
                    ) : null}
                  </div>
                  {isCollapsed || loading ? null : rows.length > 0 ? (
                    rows.map(renderRow)
                  ) : (
                    <SectionEmpty kind={key} canCreateChannel={canCreateChannel} />
                  )}
                </section>
              );
            })}
          </>
        )}
        {/* Spinner sits BELOW the section headers, not in place of them: the
            per-section `+` is the only way to start a conversation now, and
            hiding it behind the initial load would make the app briefly
            unusable on every mount. */}
        {loading ? (
          <div style={{ padding: 16 }}>
            <Spinner />
          </div>
        ) : null}
      </div>
    </nav>
  );
}
