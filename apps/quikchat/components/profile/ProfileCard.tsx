"use client";

import { Avatar, Button, Calendar, Modal, Phone } from "@/components/ui";
import type { ProfileTarget } from "./ProfileProvider";

/**
 * Read-only profile card (S14b). Identity/avatar are platform-owned — this is a
 * view, not an editor: name, avatar, presence, channel role, and a "Message"
 * action (hidden for your own profile).
 */
export function ProfileCard({
  target,
  isSelf,
  canSchedule,
  onMessage,
  onCall,
  onSchedule,
  onClose,
}: {
  target: ProfileTarget;
  isSelf: boolean;
  canSchedule?: boolean;
  onMessage: () => void;
  onCall?: () => void;
  onSchedule?: () => void;
  onClose: () => void;
}) {
  const { user, roleInChannel, online } = target;
  return (
    <Modal open onClose={onClose} title="Profile">
      <div className="qc-profile" data-testid="profile-card">
        <Avatar
          name={user.displayName}
          id={user.id}
          avatarUrl={user.avatarUrl}
          size={64}
          online={online}
        />
        <div className="qc-profile__name">
          {user.displayName}
          {user.isGuest ? (
            <span className="qc-badge-external" style={{ marginLeft: 8, verticalAlign: "middle" }}>
              External
            </span>
          ) : null}
        </div>
        <div className="qc-profile__meta">
          {online != null ? (
            <span className="qc-profile__presence" data-online={online}>
              {online ? "Online" : "Offline"}
            </span>
          ) : null}
          {roleInChannel ? <span className="qc-role-badge">{roleInChannel}</span> : null}
        </div>
        {!isSelf ? (
          <div className="qc-profile__actions">
            <Button variant="primary" onClick={onMessage}>
              Message
            </Button>
            {onCall ? (
              <Button variant="ghost" onClick={onCall}>
                <Phone size={16} aria-hidden /> Call
              </Button>
            ) : null}
            {canSchedule && onSchedule ? (
              <Button variant="ghost" onClick={onSchedule}>
                <Calendar size={16} aria-hidden /> Schedule meeting
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
