"use client";

import { Avatar } from "@/components/ui";

export interface ActiveSpeakerProps {
  id: string;
  name: string;
  isMuted: boolean;
  hasVideo: boolean;
  videoStream?: MediaStream | null;
  isLocal: boolean;
}

export function ActiveSpeaker({
  id,
  name,
  isMuted,
  hasVideo,
  videoStream,
  isLocal,
}: ActiveSpeakerProps) {
  return (
    <div className="qc-active-speaker" data-testid="active-speaker" data-speaking="true">
      {hasVideo && videoStream ? (
        <video
          className="qc-active-speaker__video"
          autoPlay
          playsInline
          muted={isLocal}
          ref={(el) => {
            if (el && videoStream) el.srcObject = videoStream;
          }}
        />
      ) : (
        <div className="qc-active-speaker__avatar">
          <Avatar name={name} id={id} size={96} />
        </div>
      )}
      <div className="qc-active-speaker__overlay">
        <span className="qc-active-speaker__name">{isLocal ? `${name} (You)` : name}</span>
        {isMuted ? (
          <span className="qc-active-speaker__muted" aria-label="Muted">
            🔇
          </span>
        ) : null}
      </div>
      <div className="qc-active-speaker__indicator" />
    </div>
  );
}
