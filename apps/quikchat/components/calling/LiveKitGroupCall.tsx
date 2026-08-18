"use client";

import { useEffect, useState } from "react";
import { GroupCallGrid } from "./GroupCallGrid";
import { CallControls } from "./CallControls";
import { RemovedFromCallToast } from "./RemovedFromCallToast";
import { useLiveKitRoom } from "@/lib/use-livekit-room";

export interface LiveKitGroupCallProps {
  token: string;
  livekitUrl: string;
  callId: string;
  localUserId: string;
  callType: "audio" | "video";
  /** Host = the call's initiator, matching the roomAdmin grant on the token. */
  isHost: boolean;
  /** Shown in the removed-from-call explanation; falls back to a generic label. */
  channelName?: string;
  onEndCall: () => void;
}

export function LiveKitGroupCall({
  token,
  livekitUrl,
  callId,
  localUserId,
  callType,
  isHost,
  channelName = "this call",
  onEndCall,
}: LiveKitGroupCallProps) {
  const [showParticipantList, setShowParticipantList] = useState(false);
  const {
    participants,
    isMuted,
    isCameraOff,
    isScreenSharing,
    mediaError,
    isReconnecting,
    terminalDisconnect,
    removedByHost,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    handleDeviceChange,
    disconnect,
  } = useLiveKitRoom({ livekitUrl, token, localUserId, callType });

  const handleEndCall = () => {
    disconnect();
    onEndCall();
  };

  // Host-only participant management. Best-effort: these are live UI actions
  // on someone else's connection, not persisted state — a failed fetch just
  // means the click didn't take, no different from a dropped LiveKit RPC.
  const handleToggleMuteOther = (identity: string, muted: boolean) => {
    void fetch(`/api/calls/${callId}/participants/${identity}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: muted ? "mute" : "unmute" }),
    }).catch(() => undefined);
  };

  const handleRemove = (identity: string) => {
    void fetch(`/api/calls/${callId}/participants/${identity}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove" }),
    }).catch(() => undefined);
  };

  const handleMuteAll = () => {
    void fetch(`/api/calls/${callId}/mute-all`, { method: "POST" }).catch(() => undefined);
  };

  // The room ended remotely (deleted, or reconnection exhausted) — run the
  // same end-call path the hang-up button uses. An effect, not a render-time
  // call: onEndCall causes side effects (PATCH, window.close()) that must
  // never run during render.
  useEffect(() => {
    // `removedByHost` is excluded: it renders the explanation below, and
    // onEndCall closes the window. Running it here too would tear the window
    // down before the removed participant could read why — which is the exact
    // silent close this change exists to fix. Their dismiss triggers it.
    if (terminalDisconnect && !removedByHost) onEndCall();
  }, [terminalDisconnect, removedByHost, onEndCall]);

  // Removed by the host: hold the window open on an explanation instead of the
  // silent close that made a kick indistinguishable from the call simply
  // ending. `removedByHost` is a strict subset of `terminalDisconnect` and is
  // only ever set on an explicit PARTICIPANT_REMOVED, so an unrecognised
  // disconnect reason still takes the normal path above.
  if (removedByHost) {
    return <RemovedFromCallToast channelName={channelName} onDismiss={onEndCall} />;
  }

  if (terminalDisconnect) return null;

  return (
    <div
      className="qc-livekit-group-call"
      style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}
    >
      {mediaError ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <h3>Media Error</h3>
          <p>{mediaError}</p>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <GroupCallGrid
            participants={participants}
            localUserId={localUserId}
            isAdmin={isHost}
            showParticipantList={showParticipantList}
            onToggleMute={handleToggleMuteOther}
            onRemove={handleRemove}
            onMuteAll={handleMuteAll}
          />
        </div>
      )}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: 16,
          display: "flex",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
        }}
      >
        <CallControls
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onEndCall={handleEndCall}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={toggleScreenShare}
          screenShareLiveKitMode={true}
          onToggleParticipantList={() => setShowParticipantList((v) => !v)}
          showParticipantList={showParticipantList}
          onDeviceChange={handleDeviceChange}
        />
      </div>
      {isReconnecting ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            padding: 8,
            textAlign: "center",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
          }}
        >
          Reconnecting…
        </div>
      ) : null}
    </div>
  );
}
