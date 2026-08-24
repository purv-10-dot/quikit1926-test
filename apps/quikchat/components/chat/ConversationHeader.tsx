"use client";

import type { ChannelListItem } from "@/lib/shared";
import {
  Avatar,
  CalendarPlus,
  IconButton,
  Info,
  Phone,
  Pin,
  PinOff,
  Search,
} from "@/components/ui";
import { useProfile } from "@/components/profile/ProfileProvider";
import { formatLastSeen } from "@/lib/format";
import type { EffectiveStatus } from "@/lib/presence-store";
import { avatarVariantFor } from "./ChannelList";

export interface ConversationHeaderProps {
  channel: ChannelListItem;
  /** User ids currently online (shared-channel presence). */
  online?: ReadonlySet<string>;
  /** Effective presence status accessor (rich status dot). Falls back to online-only. */
  statusOf?: (userId: string) => EffectiveStatus;
  /** Excluded from the "N online" count and the DM presence sub-line. */
  currentUserId?: string;
  /**
   * DM peer's last-seen instant, already privacy-resolved server-side. Only read
   * when the peer is offline. null/absent → the plain "Direct message" fallback:
   * "hidden by privacy" and "never recorded" must look identical here.
   */
  lastSeen?: string | null;
  onToggleInfo: () => void;
  /** Open the scheduling modal seeded with the channel's members (S15a). */
  onSchedule?: () => void;
  /** Start a call in the current channel. */
  onCall?: () => void;
  /** Pin / unpin this conversation in the viewer's own list (QC_010). */
  onTogglePin?: () => void;
}

export function ConversationHeader({
  channel,
  online,
  statusOf,
  currentUserId,
  lastSeen,
  onToggleInfo,
  onSchedule,
  onCall,
  onTogglePin,
}: ConversationHeaderProps) {
  const { openProfile } = useProfile();
  const isGroup = channel.type === "group";
  // Teams-style "External" tag: only meaningful for a 1:1 DM with a Guest-role
  // peer — a group's avatar-stack badges (if ever added) would be the place
  // for a multi-member equivalent, not this single title-line tag.
  const dmPeer = !isGroup ? channel.members.find((m) => m.id !== currentUserId) : undefined;
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
  // Offline DM only: "last seen today at 3:42 PM", falling back to the static
  // label when there's no value to show. The "Active now" path is unchanged —
  // a live peer's last-seen is irrelevant even when one is loaded.
  const lastSeenLabel = !isGroup && !dmOnline ? formatLastSeen(lastSeen) : "";
  const sub = isGroup
    ? `${channel.members.length} members${onlineCount ? ` · ${onlineCount} online` : ""}`
    : channel.members.length > 0
      ? dmOnline
        ? "Active now"
        : lastSeenLabel || "Direct message"
      : "";

  return (
    <header className="qc-convo-head">
      <div className="qc-convo-head__id">
        <Avatar
          name={channel.name ?? "Direct message"}
          id={channel.channelId}
          avatarUrl={channel.avatarUrl}
          variant={avatarVariantFor(channel)}
          size={38}
        />
        <div className="qc-min0">
          <div className="qc-convo-title">
            <span className="qc-truncate">{channel.name ?? "Direct message"}</span>
            {dmPeer?.isGuest ? <span className="qc-badge-external">External</span> : null}
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
                status={statusOf?.(m.id)}
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
        {onTogglePin ? (
          <IconButton
            label={channel.isPriority ? "Unpin conversation" : "Pin conversation"}
            onClick={onTogglePin}
          >
            {channel.isPriority ? <PinOff size={18} /> : <Pin size={18} />}
          </IconButton>
        ) : null}
        <IconButton label="Conversation info" onClick={onToggleInfo}>
          <Info size={18} />
        </IconButton>
      </div>
    </header>
  );
}
