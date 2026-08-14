"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// `DisconnectReason` is a VALUE import (a TS enum), not a type-only one — the
// removed-by-host check below compares against a real member at runtime.
import { DisconnectReason, Room, RoomEvent, Track } from "livekit-client";
import type { Participant } from "@/components/calling/GroupCallGrid";

export interface UseLiveKitRoomOptions {
  livekitUrl: string;
  token: string;
  localUserId: string;
  /** Audio calls never request the camera — mirrors the old mesh behavior. */
  callType: "audio" | "video";
}

export interface UseLiveKitRoomResult {
  participants: Participant[];
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  /** Our own screen-share track as a MediaStream, for a local preview tile —
   * kept separate from each Participant's `videoStream` (camera+mic only). */
  localScreenShareStream: MediaStream | null;
  mediaError: string | null;
  /** A reconnection attempt is in progress (RoomEvent.Reconnecting → Reconnected). */
  isReconnecting: boolean;
  /**
   * The room disconnected for a reason OTHER than our own call to `disconnect()`
   * below — e.g. the room was deleted server-side (the other party ended the
   * call, or the timeout sweep reaped it) or reconnection was exhausted. The
   * caller should treat this as "the call is over" and tear down its own UI;
   * unlike the raw `RoomEvent.Disconnected`, this is never a false alarm for a
   * transient reconnect (that's `isReconnecting`) and never fires for our own
   * intentional hangup (that's already handled by the caller).
   */
  terminalDisconnect: boolean;
  /**
   * The host removed this participant from the call (LiveKit's
   * `DisconnectReason.PARTICIPANT_REMOVED`). A STRICT SUBSET of
   * `terminalDisconnect` — when true, that is true as well. False for every
   * other ending, including reasons this hook does not recognise, so a caller
   * can safely treat it as "say you were removed" without risking that claim on
   * an ordinary hangup.
   */
  removedByHost: boolean;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  handleDeviceChange: (kind: "audioinput" | "videoinput", deviceId: string) => void;
  /** Leave the room intentionally (call before your own end-call bookkeeping). */
  disconnect: () => void;
  /** Re-attempt camera/mic access after a permission denial (the "Retry" button). */
  retryMedia: () => void;
}

/**
 * Owns a LiveKit `Room` connection and projects it into plain participant
 * state. Shared by the group grid and the 1:1 call window — the only
 * difference between a 1:1 call and a group call, from LiveKit's perspective,
 * is how many tiles the UI renders.
 */
export function useLiveKitRoom({
  livekitUrl,
  token,
  localUserId,
  callType,
}: UseLiveKitRoomOptions): UseLiveKitRoomResult {
  const roomRef = useRef<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenShareStream, setLocalScreenShareStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [terminalDisconnect, setTerminalDisconnect] = useState(false);
  const [removedByHost, setRemovedByHost] = useState(false);
  // Distinguishes OUR OWN room.disconnect() (unmount / explicit hangup) from a
  // server-initiated one (room deleted, kicked, reconnect exhausted) — only the
  // latter should surface as `terminalDisconnect`.
  const intentionalDisconnectRef = useRef(false);

  // Request camera (video calls only) + microphone; tolerates either failing
  // independently. Shared by the initial connect and the "Retry" action so a
  // permission denial can be re-attempted without reconnecting to the room.
  const enableMedia = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    setMediaError(null);

    let cameraOk = false;
    let micOk = false;
    if (callType === "video") {
      try {
        await room.localParticipant.setCameraEnabled(true);
        cameraOk = true;
      } catch (cameraErr) {
        console.warn("LiveKit camera enable failed:", cameraErr);
      }
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      micOk = true;
    } catch (micErr) {
      console.warn("LiveKit microphone enable failed:", micErr);
    }

    setIsCameraOff(!cameraOk);
    setIsMuted(!micOk);

    if (callType === "video" && !cameraOk && !micOk) {
      setMediaError("Could not access camera or microphone.");
    } else if (callType === "audio" && !micOk) {
      setMediaError("Could not access microphone.");
    }
  }, [callType]);

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    intentionalDisconnectRef.current = false;

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
      const screenTrack = screenPub?.track?.mediaStreamTrack;
      setLocalScreenShareStream(screenTrack ? new MediaStream([screenTrack]) : null);

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
        const rCameraPub = p.getTrackPublication(Track.Source.Camera);
        const rMicPub = p.getTrackPublication(Track.Source.Microphone);
        const rScreenPub = p.getTrackPublication(Track.Source.ScreenShare);
        const tracks: MediaStreamTrack[] = [];
        if (rCameraPub?.track?.mediaStreamTrack) {
          tracks.push(rCameraPub.track.mediaStreamTrack);
        }
        if (rMicPub?.track?.mediaStreamTrack) {
          tracks.push(rMicPub.track.mediaStreamTrack);
        }
        const videoStream = tracks.length > 0 ? new MediaStream(tracks) : null;

        list.push({
          id: p.identity,
          name: p.name || p.identity,
          isSpeaking: p.isSpeaking,
          isMuted: !p.isMicrophoneEnabled,
          hasVideo: rCameraPub?.isEnabled ?? false,
          hasScreenShare: rScreenPub?.isEnabled ?? false,
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
      .on(RoomEvent.Reconnecting, () => setIsReconnecting(true))
      .on(RoomEvent.Reconnected, () => setIsReconnecting(false))
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        setIsReconnecting(false);
        if (intentionalDisconnectRef.current) return;
        // Any non-intentional disconnect still ends the call — that behaviour is
        // unchanged. The reason is now inspected for ONE extra fact: whether the
        // host removed us, which is the only case that earns a different
        // explanation in the UI.
        //
        // Deliberately an explicit positive match, never an else-branch: an
        // unmapped or absent reason (SERVER_SHUTDOWN, SIGNAL_CLOSE, a reason
        // added by a future livekit-client, or `undefined`) falls through as a
        // normal end. Telling someone they were removed when they were not is
        // worse than the silence this replaces.
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) setRemovedByHost(true);
        setTerminalDisconnect(true);
      });

    const init = async () => {
      try {
        await room.connect(livekitUrl, token);
        setIsReconnecting(false);
        await enableMedia();
        updateParticipants();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to connect to call";
        setMediaError(msg);
        console.error("LiveKit connection failed:", err);
      }
    };

    void init();

    return () => {
      intentionalDisconnectRef.current = true;
      void room.disconnect();
    };
  }, [livekitUrl, token, localUserId, callType, enableMedia]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isMicrophoneEnabled;
    void room.localParticipant.setMicrophoneEnabled(!enabled);
    setIsMuted(enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isCameraEnabled;
    void room.localParticipant.setCameraEnabled(!enabled);
    setIsCameraOff(enabled);
  }, []);

  const toggleScreenShare = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isScreenShareEnabled;
    void room.localParticipant.setScreenShareEnabled(!enabled);
    setIsScreenSharing(!enabled);
  }, []);

  const handleDeviceChange = useCallback((kind: "audioinput" | "videoinput", deviceId: string) => {
    void roomRef.current?.switchActiveDevice(kind, deviceId);
  }, []);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    void roomRef.current?.disconnect();
  }, []);

  const retryMedia = useCallback(() => {
    void enableMedia();
  }, [enableMedia]);

  return {
    participants,
    isMuted,
    isCameraOff,
    isScreenSharing,
    localScreenShareStream,
    mediaError,
    isReconnecting,
    terminalDisconnect,
    removedByHost,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    handleDeviceChange,
    disconnect,
    retryMedia,
  };
}
