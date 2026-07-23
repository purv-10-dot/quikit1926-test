"use client";

import { useCallback, useEffect, useState } from "react";
import { IconButton, Mic, MicOff, PhoneOff, Users, Video, VideoOff } from "@/components/ui";
import { ScreenShare } from "./ScreenShare";

export interface CallControlsProps {
  isMuted: boolean;
  isCameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
  onToggleParticipantList?: () => void;
  showParticipantList?: boolean;
  isScreenSharing?: boolean;
  onToggleScreenShare?: (stream: MediaStream | null) => void;
  screenShareLiveKitMode?: boolean;
  isAudioOnly?: boolean;
  localStream?: MediaStream | null;
  onDeviceChange?: (kind: "audioinput" | "videoinput", deviceId: string) => void;
}

export function CallControls({
  isMuted,
  isCameraOff,
  onToggleMute,
  onToggleCamera,
  onEndCall,
  onToggleParticipantList,
  showParticipantList,
  isScreenSharing,
  onToggleScreenShare,
  screenShareLiveKitMode,
  isAudioOnly = false,
  localStream,
  onDeviceChange,
}: CallControlsProps) {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [showDevicePicker, setShowDevicePicker] = useState(false);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
      // Set current selections from localStream
      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        const videoTrack = localStream.getVideoTracks()[0];
        if (audioTrack) {
          const settings = audioTrack.getSettings();
          if (settings.deviceId) setSelectedAudioId(settings.deviceId);
        }
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          if (settings.deviceId) setSelectedVideoId(settings.deviceId);
        }
      }
    } catch {
      // Device enumeration not supported
    }
  }, [localStream]);

  useEffect(() => {
    void enumerateDevices();
  }, [enumerateDevices]);

  const handleAudioChange = useCallback(
    async (deviceId: string) => {
      setSelectedAudioId(deviceId);
      onDeviceChange?.("audioinput", deviceId);
    },
    [onDeviceChange],
  );

  const handleVideoChange = useCallback(
    async (deviceId: string) => {
      setSelectedVideoId(deviceId);
      onDeviceChange?.("videoinput", deviceId);
    },
    [onDeviceChange],
  );

  return (
    <div className="qc-call-controls" role="toolbar" aria-label="Call controls">
      <IconButton
        label={isMuted ? "Unmute microphone" : "Mute microphone"}
        onClick={onToggleMute}
        disabled={isAudioOnly}
      >
        {isMuted ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
      </IconButton>
      <IconButton
        label={isCameraOff ? "Turn on camera" : "Turn off camera"}
        onClick={onToggleCamera}
      >
        {isCameraOff ? <VideoOff size={20} aria-hidden /> : <Video size={20} aria-hidden />}
      </IconButton>
      {onToggleScreenShare ? (
        <ScreenShare
          isSharing={isScreenSharing ?? false}
          onToggle={onToggleScreenShare}
          livekitMode={screenShareLiveKitMode}
        />
      ) : null}
      {onToggleParticipantList ? (
        <IconButton
          label={showParticipantList ? "Hide participants" : "Show participants"}
          onClick={onToggleParticipantList}
        >
          <Users size={20} aria-hidden />
        </IconButton>
      ) : null}
      {/* Device picker button */}
      <IconButton
        label="Select devices"
        onClick={() => setShowDevicePicker((prev) => !prev)}
        aria-expanded={showDevicePicker}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </IconButton>
      {showDevicePicker && (
        <div className="qc-device-picker">
          <div className="qc-device-picker__label">Microphone</div>
          <select
            value={selectedAudioId}
            onChange={(e) => handleAudioChange(e.target.value)}
            aria-label="Select microphone"
          >
            {audioDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
          <div className="qc-device-picker__label">Camera</div>
          <select
            value={selectedVideoId}
            onChange={(e) => handleVideoChange(e.target.value)}
            aria-label="Select camera"
          >
            {videoDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      )}
      <IconButton label="End call" onClick={onEndCall} className="qc-call-controls__end">
        <PhoneOff size={20} aria-hidden />
      </IconButton>
    </div>
  );
}
