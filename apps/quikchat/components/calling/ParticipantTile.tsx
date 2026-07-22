"use client";

import { Avatar } from "@/components/ui";

export interface ParticipantTileProps {
  name: string;
  userId: string;
  avatarUrl?: string | null;
  isLocal: boolean;
  isMuted: boolean;
  videoStream?: MediaStream | null;
}

export function ParticipantTile({
  name,
  userId,
  avatarUrl,
  isLocal,
  isMuted,
  videoStream,
}: ParticipantTileProps) {
  return (
    <div
      className="qc-call-tile"
      data-testid="participant-tile"
      aria-label={`${name}${isMuted ? ", muted" : ""}${isLocal ? ", you" : ""}`}
    >
      {videoStream ? (
        <video
          className="qc-call-tile__video"
          autoPlay
          playsInline
          muted={isLocal}
          ref={(el) => {
            if (el && videoStream) el.srcObject = videoStream;
          }}
        />
      ) : (
        <div className="qc-call-tile__avatar">
          <Avatar name={name} id={userId} avatarUrl={avatarUrl} size={64} />
        </div>
      )}
      <div className="qc-call-tile__overlay">
        <span className="qc-call-tile__name">{isLocal ? `${name} (You)` : name}</span>
        {isMuted ? (
          <span className="qc-call-tile__muted" aria-label="Muted">
            🔇
          </span>
        ) : null}
      </div>
    </div>
  );
}
