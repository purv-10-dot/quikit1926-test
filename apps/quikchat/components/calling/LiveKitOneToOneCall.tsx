"use client";

import { useEffect, useRef } from "react";
import { CallWindow } from "./CallWindow";
import { useLiveKitRoom } from "@/lib/use-livekit-room";

export interface LiveKitOneToOneCallProps {
  callId: string;
  token: string;
  livekitUrl: string;
  localUserId: string;
  remoteName: string;
  remoteUserId: string;
  remoteAvatarUrl?: string | null;
  callType: "audio" | "video";
  localUserName?: string;
  onEndCall: () => void;
  /** Fires once, the first time the other party's tracks appear — the
   * "call connected" cue (replaces the old mesh's pc.ontrack/call:answer). */
  onRemoteJoined?: () => void;
}

/** 1:1 calls over LiveKit — same hook as the group grid, rendered through the
 * richer 1:1 layout (CallWindow: active-speaker duo view, PIP local tile). */
export function LiveKitOneToOneCall({
  callId,
  token,
  livekitUrl,
  localUserId,
  remoteName,
  remoteUserId,
  remoteAvatarUrl,
  callType,
  localUserName,
  onEndCall,
  onRemoteJoined,
}: LiveKitOneToOneCallProps) {
  const {
    participants,
    isMuted,
    isCameraOff,
    isScreenSharing,
    localScreenShareStream,
    mediaError,
    isReconnecting,
    terminalDisconnect,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    handleDeviceChange,
    disconnect,
    retryMedia,
  } = useLiveKitRoom({ livekitUrl, token, localUserId, callType });

  const local = participants.find((p) => p.id === localUserId);
  const remote = participants.find((p) => p.id !== localUserId);

  const remoteJoinedRef = useRef(false);
  useEffect(() => {
    if (remote && !remoteJoinedRef.current) {
      remoteJoinedRef.current = true;
      onRemoteJoined?.();
    }
  }, [remote, onRemoteJoined]);

  const handleEndCall = () => {
    disconnect();
    onEndCall();
  };

  // The room ended remotely (the other party hung up and the room was
  // deleted, or reconnection was exhausted) — run the same end-call path the
  // hang-up button uses. An effect, not a render-time call.
  useEffect(() => {
    if (terminalDisconnect) onEndCall();
  }, [terminalDisconnect, onEndCall]);

  if (terminalDisconnect) return null;

  return (
    <CallWindow
      callId={callId}
      localStream={local?.videoStream ?? null}
      remoteStream={remote?.videoStream ?? null}
      remoteName={remoteName}
      remoteUserId={remoteUserId}
      remoteAvatarUrl={remoteAvatarUrl}
      remoteIsMuted={remote?.isMuted ?? false}
      isRemoteSpeaking={remote?.isSpeaking ?? false}
      onEndCall={handleEndCall}
      mediaError={mediaError}
      onRetryMedia={retryMedia}
      isAudioOnly={callType === "audio"}
      isReconnecting={isReconnecting}
      onDeviceChange={handleDeviceChange}
      isScreenSharing={isScreenSharing}
      onToggleScreenShare={toggleScreenShare}
      screenShareStream={localScreenShareStream}
      localUserName={localUserName}
      isMuted={isMuted}
      onToggleMute={toggleMute}
      isCameraOff={isCameraOff}
      onToggleCamera={toggleCamera}
    />
  );
}
