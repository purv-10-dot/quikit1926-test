"use client";

import type { ChannelListItem } from "@/lib/shared";
import { Avatar, CalendarPlus, IconButton, Info, Phone, Search } from "@/components/ui";
import { useProfile } from "@/components/profile/ProfileProvider";

export interface ConversationHeaderProps {
  channel: ChannelListItem;
  /** User ids currently online (shared-channel presence). */
  online?: ReadonlySet<string>;
  /** Excluded from the "N online" count and the DM presence sub-line. */
  currentUserId?: string;
  onToggleInfo: () => void;
  /** Open the scheduling modal seeded with the channel's members (S15a). */
  onSchedule?: () => void;
  /** Start a call in the current channel. */
  onCall?: () => void;
}

export function ConversationHeader({
  channel,
  online,
  currentUserId,
  onToggleInfo,
  onSchedule,
  onCall,
}: ConversationHeaderProps) {
  const { openProfile } = useProfile();
  const isGroup = channel.type === "group";
  const stack = channel.members.slice(0, 3);
  const extra = channel.members.length - stack.length;
  // Count online members other than the viewer.
  const onlineCount = online
    ? channel.members.filter((m) => m.id !== currentUserId && online.has(m.id)).length
    : 0;
  const dmOnline =
    !isGroup && online
      ? channel.members.some((m) => m.id !== currentUserId && online.has(m.id))
      : false;
  const sub = isGroup
    ? `${channel.members.length} members${onlineCount ? ` · ${onlineCount} online` : ""}`
    : channel.members.length > 0
      ? dmOnline
        ? "Active now"
        : "Direct message"
      : "";

  return (
    <header className="qc-convo-head">
      <div className="qc-convo-head__id">
        <Avatar
          name={channel.name ?? "Direct message"}
          id={channel.channelId}
          avatarUrl={channel.avatarUrl}
          group={isGroup}
          size={38}
        />
        <div className="qc-min0">
          <div className="qc-convo-title">
            <span className="qc-truncate">{channel.name ?? "Direct message"}</span>
          </div>
          <div className="qc-convo-sub">{sub}</div>
        </div>
      </div>
      <div className="qc-convo-head__actions">
        <span className="qc-avatar-stack">
          {stack.map((m) => (
            <button
              key={m.id}
              type="button"
              className="qc-avatar-btn"
              aria-label={`View ${m.displayName}'s profile`}
              onClick={() =>
                openProfile({ user: m, online: online ? online.has(m.id) : undefined })
              }
            >
              <Avatar
                name={m.displayName}
                id={m.id}
                avatarUrl={m.avatarUrl}
                size={24}
                online={online ? online.has(m.id) : undefined}
              />
            </button>
          ))}
          {extra > 0 ? (
            <span className="qc-avatar qc-avatar-more">
              <span className="qc-avatar__inner">+{extra}</span>
            </span>
          ) : null}
        </span>
        <IconButton label="Search messages (coming soon)" disabled>
          <Search size={18} />
        </IconButton>
        {onCall ? (
          <IconButton label="Start call" onClick={onCall}>
            <Phone size={18} />
          </IconButton>
        ) : null}
        {onSchedule ? (
          <IconButton label="Schedule meeting" onClick={onSchedule}>
            <CalendarPlus size={18} />
          </IconButton>
        ) : null}
        <IconButton label="Conversation info" onClick={onToggleInfo}>
          <Info size={18} />
        </IconButton>
      </div>
    </header>
  );
}
