"use client";

import { useState } from "react";
import type { ChannelListItem, ChannelMemberDto, MessageDto, PublicUser } from "@/lib/shared";
import {
  Avatar,
  Button,
  ChevronLeft,
  IconButton,
  Menu,
  MenuItem,
  MoreHorizontal,
  Phone,
  Popover,
  Video,
} from "@/components/ui";
import { messagePreview } from "@/lib/preview";
import { useProfile } from "@/components/profile/ProfileProvider";
import { ChannelNotificationPref } from "./ChannelNotificationPref";
import { InviteManager } from "./InviteManager";
import { UserPicker } from "./UserPicker";

export interface InfoDrawerProps {
  channel: ChannelListItem;
  members: ChannelMemberDto[];
  pinned: MessageDto[];
  currentUserId: string;
  onlineIds?: ReadonlySet<string>;
  onAddMembers?: (userIds: string[]) => void;
  onRemoveMember?: (userId: string) => void;
  onSetRole?: (userId: string, role: "admin" | "member") => void;
  roleError?: string | null;
  /** Start a call in this conversation (wired to the workspace call handler). */
  onCall?: () => void;
  /** Close the drawer (back arrow). */
  onBack?: () => void;
}

export function InfoDrawer({
  channel,
  members,
  pinned,
  currentUserId,
  onlineIds,
  onAddMembers,
  onRemoveMember,
  onSetRole,
  roleError,
  onCall,
  onBack,
}: InfoDrawerProps) {
  const { openProfile } = useProfile();
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<PublicUser[]>([]);
  const [manageOpen, setManageOpen] = useState<string | null>(null);

  const isGroup = channel.type === "group";
  const isAdmin = members.find((m) => m.id === currentUserId)?.role === "admin";
  const canManage = isGroup && isAdmin && !!onAddMembers;

  return (
    <aside className="qc-drawer" aria-label="Conversation details" data-testid="info-drawer">
      {onBack ? (
        <div className="qc-drawer-back">
          <IconButton label="Back" onClick={onBack}>
            <ChevronLeft size={18} />
          </IconButton>
        </div>
      ) : null}
      <section className="qc-drawer-hero">
        <Avatar
          name={channel.name ?? "Direct message"}
          id={channel.channelId}
          avatarUrl={channel.avatarUrl}
          group={isGroup}
          size={84}
        />
        <div className="qc-drawer-hero__name">{channel.name ?? "Direct message"}</div>
        <div className="qc-drawer-hero__sub">
          {isGroup ? `${members.length} members` : "Direct message"}
        </div>
        {onCall ? (
          <div className="qc-drawer-hero__actions">
            <button type="button" className="qc-hero-btn" onClick={onCall}>
              <Phone size={15} /> Voice chat
            </button>
            <button type="button" className="qc-hero-btn" onClick={onCall}>
              <Video size={15} /> Video chat
            </button>
          </div>
        ) : null}
      </section>

      <section className="qc-drawer-section">
        <div className="qc-label">Details</div>
        <div className="qc-detail-row">
          <span>Name</span>
          <span>{channel.name ?? "Direct message"}</span>
        </div>
        <div className="qc-detail-row">
          <span>Type</span>
          <span>{isGroup ? "Group" : "Direct message"}</span>
        </div>
        <div className="qc-detail-row">
          <span>Visibility</span>
          <span>{channel.visibility}</span>
        </div>
        <div className="qc-detail-row">
          <span>Members</span>
          <span>{members.length}</span>
        </div>
      </section>

      <section className="qc-drawer-section">
        <div className="qc-label">Members</div>
        {roleError ? (
          <div className="qc-detail-row" role="alert" data-testid="role-error">
            <span>{roleError}</span>
          </div>
        ) : null}
        {members.map((m) => (
          <div key={m.id} className="qc-drawer-member">
            <button
              type="button"
              className="qc-avatar-btn"
              aria-label={`View ${m.displayName}'s profile`}
              onClick={() =>
                openProfile({ user: m, roleInChannel: m.role, online: onlineIds?.has(m.id) })
              }
            >
              <Avatar
                name={m.displayName}
                id={m.id}
                avatarUrl={m.avatarUrl}
                size={28}
                online={onlineIds?.has(m.id)}
              />
            </button>
            <span style={{ flex: 1 }}>{m.displayName}</span>
            <span className="qc-role-badge">{m.role}</span>
            {canManage && m.id !== currentUserId ? (
              <Popover
                placement="bottom"
                label={`Manage ${m.displayName}`}
                open={manageOpen === m.id}
                onOpenChange={(o) => setManageOpen(o ? m.id : null)}
                trigger={
                  <IconButton label={`Manage ${m.displayName}`}>
                    <MoreHorizontal size={14} />
                  </IconButton>
                }
              >
                <Menu label="Member actions">
                  <MenuItem
                    onSelect={() => {
                      onSetRole?.(m.id, m.role === "admin" ? "member" : "admin");
                      setManageOpen(null);
                    }}
                  >
                    {m.role === "admin" ? "Make member" : "Make admin"}
                  </MenuItem>
                  <MenuItem
                    danger
                    onSelect={() => {
                      onRemoveMember?.(m.id);
                      setManageOpen(null);
                    }}
                  >
                    Remove from channel
                  </MenuItem>
                </Menu>
              </Popover>
            ) : null}
          </div>
        ))}

        {canManage ? (
          adding ? (
            <div style={{ marginTop: 8 }}>
              <UserPicker
                multi
                excludeChannelId={channel.channelId}
                onChange={setToAdd}
                placeholder="Add people to this channel"
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={toAdd.length === 0}
                  onClick={() => {
                    onAddMembers?.(toAdd.map((u) => u.id));
                    setToAdd([]);
                    setAdding(false);
                  }}
                >
                  Add{toAdd.length ? ` (${toAdd.length})` : ""}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setAdding(true)} className="qc-add-member-btn">
              + Add people
            </Button>
          )
        ) : null}
      </section>

      {isGroup ? <InviteManager channelId={channel.channelId} /> : null}

      <ChannelNotificationPref channelId={channel.channelId} />

      <section className="qc-drawer-section">
        <div className="qc-label">Pinned ({pinned.length})</div>
        {pinned.length === 0 ? (
          <div className="qc-detail-row">
            <span>No pinned messages</span>
          </div>
        ) : (
          pinned.map((p) => (
            <div key={p.id} className="qc-detail-row" data-testid="pinned-item">
              <span style={{ flex: 1 }}>
                {
                  messagePreview({
                    id: p.id,
                    type: p.type,
                    content: p.content,
                    senderId: p.senderId,
                    createdAt: p.createdAt,
                  }).text
                }
              </span>
            </div>
          ))
        )}
      </section>
    </aside>
  );
}
