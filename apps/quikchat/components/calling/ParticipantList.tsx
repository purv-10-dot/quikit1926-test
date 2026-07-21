"use client";

import { useCallback } from "react";
import { Mic, X } from "@/components/ui";

export interface Participant {
  id: string;
  identity: string;
  name: string;
  isMuted: boolean;
}

export interface ParticipantListProps {
  participants: Participant[];
  currentUserId: string;
  isAdmin: boolean;
  onToggleMute: (identity: string, muted: boolean) => void;
  onRemove: (identity: string) => void;
}

export function ParticipantList({
  participants,
  currentUserId,
  isAdmin,
  onToggleMute,
  onRemove,
}: ParticipantListProps) {
  const handleToggleMute = useCallback(
    (identity: string, currentMuted: boolean) => {
      onToggleMute(identity, !currentMuted);
    },
    [onToggleMute],
  );

  const handleRemove = useCallback(
    (identity: string) => {
      onRemove(identity);
    },
    [onRemove],
  );

  return (
    <div
      className="qc-participant-list"
      role="list"
      aria-label="Participants"
      data-testid="participant-list"
    >
      {participants.map((p) => (
        <div
          key={p.id}
          className="qc-participant-list__item"
          role="listitem"
          data-testid="participant-item"
        >
          <span className="qc-participant-list__name">
            {p.identity === currentUserId ? `${p.name} (You)` : p.name}
          </span>
          <div className="qc-participant-list__actions">
            {p.isMuted ? (
              <Mic size={14} className="qc-participant-list__muted-icon" aria-label="Muted" />
            ) : (
              <Mic size={14} aria-hidden />
            )}
            {isAdmin && p.identity !== currentUserId ? (
              <>
                <button
                  type="button"
                  className="qc-participant-list__btn"
                  onClick={() => handleToggleMute(p.identity, p.isMuted)}
                  aria-label={p.isMuted ? `Unmute ${p.name}` : `Mute ${p.name}`}
                  data-testid="toggle-mute-button"
                >
                  {p.isMuted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  className="qc-participant-list__btn qc-participant-list__btn--danger"
                  onClick={() => handleRemove(p.identity)}
                  aria-label={`Remove ${p.name}`}
                  data-testid="remove-button"
                >
                  <X size={14} aria-hidden />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
