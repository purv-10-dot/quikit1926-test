"use client";

import { Avatar } from "@/components/ui";
import { HostControls } from "./HostControls";
import { ParticipantList, type Participant as ListParticipant } from "./ParticipantList";

export interface Participant {
  id: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  hasVideo: boolean;
  hasScreenShare: boolean;
  videoStream?: MediaStream | null;
}

export interface GroupCallGridProps {
  participants: Participant[];
  localUserId: string;
  isAdmin?: boolean;
  showParticipantList?: boolean;
  onMuteAll?: () => void;
  onToggleMute?: (identity: string, muted: boolean) => void;
  onRemove?: (identity: string) => void;
}

function getGridClass(count: number): string {
  if (count <= 1) return "qc-grid--single";
  if (count === 2) return "qc-grid--duo";
  if (count <= 4) return "qc-grid--quad";
  if (count <= 6) return "qc-grid--hexa";
  return "qc-grid--mega";
}

function toListParticipant(p: Participant): ListParticipant {
  return { id: p.id, identity: p.id, name: p.name, isMuted: p.isMuted };
}

export function GroupCallGrid({
  participants,
  localUserId,
  isAdmin = false,
  showParticipantList = false,
  onMuteAll,
  onToggleMute,
  onRemove,
}: GroupCallGridProps) {
  const gridClass = getGridClass(participants.length);

  return (
    <div className="qc-group-call-layout" data-testid="group-call-layout">
      <div className={`qc-group-grid ${gridClass}`} data-testid="group-call-grid">
        {participants.map((p) => (
          <div
            key={p.id}
            className="qc-group-tile"
            data-testid="participant-tile"
            data-speaking={p.isSpeaking ? "true" : "false"}
            aria-label={`${p.name}${p.isMuted ? ", muted" : ""}${p.id === localUserId ? ", you" : ""}`}
          >
            {p.hasVideo && p.videoStream ? (
              <video
                className="qc-group-tile__video"
                autoPlay
                playsInline
                muted={p.id === localUserId}
                ref={(el) => {
                  if (el && p.videoStream) el.srcObject = p.videoStream;
                }}
              />
            ) : p.hasVideo ? (
              <div className="qc-group-tile__connecting">Connecting...</div>
            ) : (
              <div className="qc-group-tile__avatar">
                <Avatar name={p.name} id={p.id} size={64} />
              </div>
            )}
            <div className="qc-group-tile__overlay">
              <span className="qc-group-tile__name">
                {p.id === localUserId ? `${p.name} (You)` : p.name}
              </span>
              {p.isMuted ? (
                <span className="qc-group-tile__muted" aria-label="Muted">
                  🔇
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {showParticipantList ? (
        <div className="qc-group-call-sidebar" data-testid="group-call-sidebar">
          {isAdmin && onMuteAll ? <HostControls isAdmin={isAdmin} onMuteAll={onMuteAll} /> : null}
          {onToggleMute && onRemove ? (
            <ParticipantList
              participants={participants.map(toListParticipant)}
              currentUserId={localUserId}
              isAdmin={isAdmin}
              onToggleMute={onToggleMute}
              onRemove={onRemove}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
