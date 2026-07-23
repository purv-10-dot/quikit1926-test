"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { GroupCallGrid, type Participant } from "./GroupCallGrid";
import { CallControls } from "./CallControls";

export interface LiveKitGroupCallProps {
  roomId: string;
  token: string;
  livekitUrl: string;
  callId: string;
  localUserId: string;
  onEndCall: () => void;
}

export function LiveKitGroupCall({
  roomId,
  token,
  livekitUrl,
  localUserId,
  onEndCall,
}: LiveKitGroupCallProps) {
  const roomRef = useRef<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    const updateParticipants = () => {
      const list: Participant[] = [];
      const localP = room.localParticipant;

      const cameraPub = localP.getTrackPublication(Track.Source.Camera);
      const micPub = localP.getTrackPublication(Track.Source.Microphone);
      const screenPub = localP.getTrackPublication(Track.Source.ScreenShare);
      const localTracks: MediaStreamTrack[] = [];
      if (cameraPub?.track?.mediaStreamTrack) {
        localTracks.push(cameraPub.track.mediaStreamTrack);
      }
      if (micPub?.track?.mediaStreamTrack) {
        localTracks.push(micPub.track.mediaStreamTrack);
      }
      const localStream = localTracks.length > 0 ? new MediaStream(localTracks) : null;

      list.push({
        id: localUserId,
        name: "You",
        isSpeaking: localP.isSpeaking,
        isMuted: !localP.isMicrophoneEnabled,
        hasVideo: cameraPub?.isEnabled ?? false,
        hasScreenShare: screenPub?.isEnabled ?? false,
        videoStream: localStream,
      });

      room.remoteParticipants.forEach((p) => {
        const cameraPub = p.getTrackPublication(Track.Source.Camera);
        const micPub = p.getTrackPublication(Track.Source.Microphone);
        const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
        const tracks: MediaStreamTrack[] = [];
        if (cameraPub?.track?.mediaStreamTrack) {
          tracks.push(cameraPub.track.mediaStreamTrack);
        }
        if (micPub?.track?.mediaStreamTrack) {
          tracks.push(micPub.track.mediaStreamTrack);
        }
        const videoStream = tracks.length > 0 ? new MediaStream(tracks) : null;

        list.push({
          id: p.identity,
          name: p.name || p.identity,
          isSpeaking: p.isSpeaking,
          isMuted: !p.isMicrophoneEnabled,
          hasVideo: cameraPub?.isEnabled ?? false,
          hasScreenShare: screenPub?.isEnabled ?? false,
          videoStream,
        });
      });

      setParticipants(list);
      setIsMuted(!localP.isMicrophoneEnabled);
      setIsCameraOff(!localP.isCameraEnabled);
      setIsScreenSharing(localP.isScreenShareEnabled);
    };

    room
      .on(RoomEvent.ParticipantConnected, updateParticipants)
      .on(RoomEvent.ParticipantDisconnected, updateParticipants)
      .on(RoomEvent.TrackSubscribed, updateParticipants)
      .on(RoomEvent.TrackUnsubscribed, updateParticipants)
      .on(RoomEvent.LocalTrackPublished, updateParticipants)
      .on(RoomEvent.LocalTrackUnpublished, updateParticipants)
      .on(RoomEvent.ActiveSpeakersChanged, updateParticipants)
      .on(RoomEvent.Disconnected, () => {
        setIsReconnecting(true);
      })
      .on(RoomEvent.Reconnected, () => {
        setIsReconnecting(false);
      });

    const init = async () => {
      try {
        await room.connect(livekitUrl, token);
        setIsReconnecting(false);

        // Enable camera and microphone independently. If camera access fails
        // (no camera, permission denied), still join with microphone so the call
        // can continue audio-only.
        let cameraOk = false;
        let micOk = false;
        try {
          await room.localParticipant.setCameraEnabled(true);
          cameraOk = true;
        } catch (cameraErr) {
          console.warn("LiveKit camera enable failed:", cameraErr);
        }
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          micOk = true;
        } catch (micErr) {
          console.warn("LiveKit microphone enable failed:", micErr);
        }

        setIsCameraOff(!cameraOk);
        setIsMuted(!micOk);

        if (!cameraOk && !micOk) {
          setMediaError("Could not access camera or microphone.");
        }

        updateParticipants();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to connect to group call";
        setMediaError(msg);
        console.error("LiveKit connection failed:", err);
      }
    };

    void init();

    return () => {
      void room.disconnect();
    };
  }, [roomId, token, livekitUrl, localUserId]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isMicrophoneEnabled;
    void room.localParticipant.setMicrophoneEnabled(!enabled);
    setIsMuted(enabled);
    setParticipants((prev) =>
      prev.map((p) => (p.id === localUserId ? { ...p, isMuted: enabled } : p)),
    );
  }, [localUserId]);

  const toggleCamera = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isCameraEnabled;
    void room.localParticipant.setCameraEnabled(!enabled);
    setIsCameraOff(enabled);
    setParticipants((prev) =>
      prev.map((p) => (p.id === localUserId ? { ...p, hasVideo: !enabled } : p)),
    );
  }, [localUserId]);

  const toggleScreenShare = useCallback(
    (_stream: MediaStream | null) => {
      const room = roomRef.current;
      if (!room) return;
      const enabled = room.localParticipant.isScreenShareEnabled;
      void room.localParticipant.setScreenShareEnabled(!enabled);
      setIsScreenSharing(!enabled);
      setParticipants((prev) =>
        prev.map((p) => (p.id === localUserId ? { ...p, hasScreenShare: !enabled } : p)),
      );
    },
    [localUserId],
  );

  const handleDeviceChange = useCallback((kind: "audioinput" | "videoinput", deviceId: string) => {
    void roomRef.current?.switchActiveDevice(
      kind === "audioinput" ? "audioinput" : "videoinput",
      deviceId,
    );
  }, []);

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
            isAdmin={true}
            showParticipantList={showParticipantList}
            onToggleMute={(id, _muted) => {
              if (id === localUserId) toggleMute();
            }}
            onRemove={() => {}}
            onMuteAll={() => {}}
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
          onEndCall={onEndCall}
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
