"use client";

import { useCallback, useEffect, useState } from "react";
import { CallControls } from "./CallControls";
import { ParticipantTile } from "./ParticipantTile";
import { ActiveSpeaker } from "./ActiveSpeaker";
import { AlertCircle, WifiOff } from "@/components/ui";

export interface CallWindowProps {
  callId: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteName: string;
  remoteUserId: string;
  remoteAvatarUrl?: string | null;
  remoteIsMuted?: boolean;
  isRemoteSpeaking?: boolean;
  onEndCall: () => void;
  mediaError?: string | null;
  onRetryMedia?: () => void;
  isAudioOnly?: boolean;
  isReconnecting?: boolean;
  onDeviceChange?: (kind: "audioinput" | "videoinput", deviceId: string) => void;
  sfuRoomId?: string;
  sfuToken?: string;
  isScreenSharing?: boolean;
  onToggleScreenShare?: (stream: MediaStream | null) => void;
  screenShareStream?: MediaStream | null;
  localUserName?: string;
  onEnableCamera?: () => void;
}

export function CallWindow({
  callId: _callId,
  localStream,
  remoteStream,
  remoteName,
  remoteUserId,
  remoteAvatarUrl,
  remoteIsMuted = false,
  isRemoteSpeaking = false,
  onEndCall,
  mediaError,
  onRetryMedia,
  isAudioOnly = false,
  isReconnecting = false,
  onDeviceChange,
  sfuRoomId: _sfuRoomId,
  sfuToken: _sfuToken,
  isScreenSharing = false,
  onToggleScreenShare,
  screenShareStream,
  localUserName = "You",
  onEnableCamera,
}: CallWindowProps) {
  const [isMuted, setIsMuted] = useState(false);
  const isDuoCall = !!remoteStream && !!localStream;

  // Derive camera state from actual video track — no independent state needed
  const videoTrack = localStream?.getVideoTracks()[0];
  const isCameraOff = !videoTrack || !videoTrack.enabled;

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => {
        t.enabled = isMuted;
      });
    }
    setIsMuted(!isMuted);
  }, [localStream, isMuted]);

  const toggleCamera = useCallback(() => {
    // No video track yet (audio-only call): request camera access
    if (!videoTrack) {
      onEnableCamera?.();
      return;
    }
    // Video track exists: toggle its enabled state
    videoTrack.enabled = !videoTrack.enabled;
    // Force re-render so the derived isCameraOff updates
    setIsMuted((prev) => prev);
  }, [videoTrack, onEnableCamera]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          toggleMute();
          break;
        case "v":
          e.preventDefault();
          toggleCamera();
          break;
        case "h":
          e.preventDefault();
          onEndCall();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleMute, toggleCamera, onEndCall]);

  // Permission denial error state
  if (mediaError) {
    return (
      <div
        className="qc-call-window"
        data-testid="call-window"
        role="region"
        aria-label="Call window"
      >
        <div className="qc-call-window__grid">
          <div className="qc-call-window__error">
            <AlertCircle size={48} style={{ marginBottom: 16, color: "var(--qc-danger)" }} />
            <h3>Microphone or camera access denied</h3>
            <p>{mediaError}</p>
            <button onClick={onRetryMedia} className="qc-btn qc-btn--primary">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="qc-call-window"
      data-testid="call-window"
      role="region"
      aria-label="Call window"
    >
      {isReconnecting && (
        <div className="qc-call-window__reconnect" role="status" aria-live="polite">
          <WifiOff size={14} aria-hidden />
          Reconnecting…
        </div>
      )}
      {isAudioOnly && (
        <div className="qc-call-window__audio-only" role="status" aria-live="polite">
          Audio only (poor connection)
        </div>
      )}
      <div
        className="qc-call-window__grid"
        data-speaking-user={isRemoteSpeaking ? remoteUserId : ""}
      >
        {remoteStream || localStream ? (
          <>
            {isDuoCall ? (
              <>
                {isRemoteSpeaking ? (
                  <ActiveSpeaker
                    id={remoteUserId}
                    name={remoteName}
                    isMuted={remoteIsMuted}
                    hasVideo={!!remoteStream?.getVideoTracks().length}
                    videoStream={remoteStream}
                    isLocal={false}
                  />
                ) : (
                  <ParticipantTile
                    name={remoteName}
                    userId={remoteUserId}
                    avatarUrl={remoteAvatarUrl}
                    isLocal={false}
                    isMuted={remoteIsMuted}
                    videoStream={remoteStream}
                  />
                )}
                <ParticipantTile
                  name={localUserName}
                  userId=""
                  isLocal={true}
                  isMuted={isMuted}
                  videoStream={
                    isScreenSharing
                      ? screenShareStream
                      : isCameraOff
                        ? null
                        : isAudioOnly
                          ? null
                          : localStream
                  }
                />
              </>
            ) : remoteStream ? (
              <ActiveSpeaker
                id={remoteUserId}
                name={remoteName}
                isMuted={remoteIsMuted}
                hasVideo={!!remoteStream?.getVideoTracks().length}
                videoStream={remoteStream}
                isLocal={false}
              />
            ) : (
              <ParticipantTile
                name={remoteName}
                userId={remoteUserId}
                avatarUrl={remoteAvatarUrl}
                isLocal={false}
                isMuted={remoteIsMuted}
                videoStream={remoteStream}
              />
            )}
          </>
        ) : (
          <div className="qc-call-window__connecting" role="status" aria-live="polite">
            Connecting...
          </div>
        )}
      </div>
      <CallControls
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onEndCall={onEndCall}
        isAudioOnly={isAudioOnly}
        localStream={localStream}
        onDeviceChange={onDeviceChange}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={onToggleScreenShare}
      />
    </div>
  );
}
