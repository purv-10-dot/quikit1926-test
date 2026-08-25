"use client";

import { useRef, useState } from "react";
import type { ChannelListItem, ChannelMemberDto, MessageDto, PublicUser } from "@/lib/shared";
import { uploadFile } from "@/lib/upload";
import {
  Avatar,
  Button,
  ChevronLeft,
  IconButton,
  Menu,
  MenuItem,
  MoreHorizontal,
  Phone,
  Pin,
  PinOff,
  Popover,
  Video,
} from "@/components/ui";
import { messagePreview } from "@/lib/preview";
import { useProfile } from "@/components/profile/ProfileProvider";
import type { EffectiveStatus } from "@/lib/presence-store";
import { ChannelNotificationPref } from "./ChannelNotificationPref";
import { InviteManager } from "./InviteManager";
import { UserPicker } from "./UserPicker";
import { avatarVariantFor } from "./ChannelList";

export interface InfoDrawerProps {
  channel: ChannelListItem;
  members: ChannelMemberDto[];
  pinned: MessageDto[];
  currentUserId: string;
  onlineIds?: ReadonlySet<string>;
  /** Effective presence status accessor (rich status dot). Falls back to online-only. */
  statusOf?: (userId: string) => EffectiveStatus;
  onAddMembers?: (userIds: string[]) => void;
  onRemoveMember?: (userId: string) => void;
  onSetRole?: (userId: string, role: "admin" | "member") => void;
  roleError?: string | null;
  /** Edit group details (name / description / avatar). Admin-only (group). */
  onUpdateDetails?: (patch: { name?: string; description?: string; avatarUrl?: string }) => void;
  /** Delete the whole group for everyone. Admin-only (group). */
  onDeleteGroup?: () => void;
  /** Leave this channel/group (self-removal). Any member, group-only. */
  onLeaveChannel?: () => void;
  /**
   * Pin / unpin this conversation for the viewer (QC_010). Per-user state, so it
   * sits with the other per-user channel prefs (notifications) rather than in
   * the admin-gated group controls.
   */
  onTogglePin?: () => void;
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
  statusOf,
  onAddMembers,
  onRemoveMember,
  onSetRole,
  roleError,
  onUpdateDetails,
  onDeleteGroup,
  onLeaveChannel,
  onTogglePin,
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
  const canEdit = isGroup && isAdmin && !!onUpdateDetails;
  const canDelete = isGroup && isAdmin && !!onDeleteGroup;
  const canLeave = isGroup && !!onLeaveChannel;
  // The server lets the sole admin leave a group with members still in it
  // (no last-admin guard — see channels.service.ts leave()), orphaning it.
  // Purely informational: surfaced in the confirm copy, never blocks the click.
  const isSoleAdminLeaving =
    isAdmin && members.length > 1 && members.filter((m) => m.role === "admin").length === 1;

  // Edit-details state (name/description inline + avatar upload).
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(channel.name ?? "");
  const [descDraft, setDescDraft] = useState(channel.description ?? "");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm — explicit typed confirmation ("DELETE").
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Leave confirm — lightweight two-step (not typed): leaving only affects the
  // caller, it doesn't destroy anyone else's data, so the heavier typed
  // confirmation reserved for "Delete for everyone" isn't proportionate here.
  const [leaveConfirming, setLeaveConfirming] = useState(false);

  const startEdit = () => {
    setNameDraft(channel.name ?? "");
    setDescDraft(channel.description ?? "");
    setEditError(null);
    setEditing(true);
  };

  const saveDetails = () => {
    const patch: { name?: string; description?: string } = {};
    const name = nameDraft.trim();
    if (name && name !== (channel.name ?? "")) patch.name = name;
    if (descDraft.trim() !== (channel.description ?? "")) patch.description = descDraft.trim();
    if (Object.keys(patch).length) onUpdateDetails?.(patch);
    setEditing(false);
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setEditError(null);
    try {
      const meta = await uploadFile(file, channel.channelId);
      onUpdateDetails?.({ avatarUrl: meta.objectPath });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Avatar upload failed");
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

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
          variant={avatarVariantFor(channel)}
          size={84}
        />
        {canEdit ? (
          <>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="avatar-input"
              onChange={onPickAvatar}
            />
            <button
              type="button"
              className="qc-hero-photo-btn"
              disabled={avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarBusy ? "Uploading…" : "Change photo"}
            </button>
          </>
        ) : null}
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
        <div className="qc-drawer-section__head">
          <div className="qc-label">Details</div>
          {canEdit && !editing ? (
            <Button variant="ghost" onClick={startEdit} data-testid="edit-details">
              Edit
            </Button>
          ) : null}
        </div>
        {editError ? (
          <div className="qc-detail-row" role="alert" data-testid="edit-error">
            <span>{editError}</span>
          </div>
        ) : null}
        {canEdit && editing ? (
          <div className="qc-detail-edit">
            <label className="qc-field">
              <span>Name</span>
              <input
                className="qc-input"
                value={nameDraft}
                maxLength={100}
                onChange={(e) => setNameDraft(e.target.value)}
                aria-label="Group name"
              />
            </label>
            <label className="qc-field">
              <span>Description</span>
              <textarea
                className="qc-input"
                value={descDraft}
                maxLength={500}
                rows={3}
                onChange={(e) => setDescDraft(e.target.value)}
                aria-label="Group description"
              />
            </label>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!nameDraft.trim()} onClick={saveDetails}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="qc-detail-row">
              <span>Name</span>
              <span>{channel.name ?? "Direct message"}</span>
            </div>
            {isGroup && channel.description ? (
              <div className="qc-detail-row">
                <span>Description</span>
                <span>{channel.description}</span>
              </div>
            ) : null}
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
          </>
        )}
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
                status={statusOf?.(m.id)}
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

      {onTogglePin ? (
        <section className="qc-drawer-section" data-testid="channel-pin-pref">
          <div className="qc-label">Conversation</div>
          <div className="qc-nset__row">
            <div>
              <div className="qc-nset__k">Pinned</div>
              <div className="qc-nset__d">
                Keeps this chat at the top of your list — just for you.
              </div>
            </div>
            <Button variant="ghost" onClick={onTogglePin} data-testid="toggle-pin">
              {channel.isPriority ? (
                <PinOff size={14} aria-hidden />
              ) : (
                <Pin size={14} aria-hidden />
              )}
              {channel.isPriority ? "Unpin" : "Pin"}
            </Button>
          </div>
        </section>
      ) : null}

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

      {canLeave ? (
        <section className="qc-drawer-section" data-testid="leave-section">
          <div className="qc-label">Leave</div>
          {leaveConfirming ? (
            <div className="qc-danger-confirm">
              <p className="qc-danger-text">
                {channel.visibility === "public" ? (
                  <>
                    Leave <strong>#{channel.name}</strong>? You can rejoin anytime from Discover.
                  </>
                ) : (
                  <>
                    Leave <strong>{channel.name}</strong>? This is a private group — you&apos;ll
                    need a new invite to rejoin.
                  </>
                )}
                {isSoleAdminLeaving ? (
                  <>
                    {" "}
                    You&apos;re the only admin — no one will be able to manage this group after
                    you leave.
                  </>
                ) : null}
              </p>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Button variant="ghost" onClick={() => setLeaveConfirming(false)}>
                  Cancel
                </Button>
                <Button
                  variant={channel.visibility === "public" ? "secondary" : "danger"}
                  onClick={() => onLeaveChannel?.()}
                  data-testid="leave-confirm"
                >
                  {channel.visibility === "public" ? "Leave channel" : "Leave group"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setLeaveConfirming(true)}
              data-testid="leave-channel"
            >
              {channel.visibility === "public" ? "Leave channel" : "Leave group"}
            </Button>
          )}
        </section>
      ) : null}

      {canDelete ? (
        <section className="qc-drawer-section qc-danger-zone" data-testid="danger-zone">
          <div className="qc-label">Danger zone</div>
          {confirming ? (
            <div className="qc-danger-confirm">
              <p className="qc-danger-text">
                This permanently deletes the group and all its messages for{" "}
                <strong>everyone</strong>. This cannot be undone. Type{" "}
                <strong>DELETE</strong> to confirm.
              </p>
              <input
                className="qc-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                aria-label="Type DELETE to confirm"
                data-testid="delete-confirm-input"
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setConfirming(false);
                    setConfirmText("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={confirmText.trim().toUpperCase() !== "DELETE"}
                  onClick={() => onDeleteGroup?.()}
                  data-testid="delete-confirm"
                >
                  Delete group
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="danger"
              onClick={() => setConfirming(true)}
              data-testid="delete-group"
            >
              Delete group
            </Button>
          )}
        </section>
      ) : null}
    </aside>
  );
}
