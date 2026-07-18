"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useToast } from "@/components/ui";
import { CallWindow } from "@/components/calling/CallWindow";
import { LiveKitGroupCall } from "@/components/calling/LiveKitGroupCall";
import {
  createPeerConnection,
  getLocalMedia,
  createOffer,
  createAnswer,
  handleAnswer,
  addIceCandidate,
  closePeerConnection,
} from "@/lib/webrtc";

type DeviceKind = "audioinput" | "videoinput";

const CALL_EVENTS = [
  "connect",
  "disconnect",
  "connect_error",
  "call:offer",
  "call:answer",
  "call:ice-candidate",
  "call:ended",
  "call:rejected",
  "call:cancelled",
  "call:timed_out",
  "call:unavailable",
  "call:ready",
];

function CallPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const callId = (params.callId as string) ?? "";
  const remoteName = searchParams.get("name") ?? "User";
  const remoteUserId = searchParams.get("userId") ?? "";
  const localUserName = searchParams.get("userName") ?? "You";
  const callType = (searchParams.get("type") ?? "video") as "audio" | "video";
  const role = searchParams.get("role") ?? "caller";
  const sfuRoomId = searchParams.get("sfuRoomId") ?? "";
  const sfuToken = searchParams.get("sfuToken") ?? "";
  const livekitUrl = searchParams.get("livekitUrl") ?? "";
  const toast = useToast();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteIsMuted, setRemoteIsMuted] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingAnimationRef = useRef<number | null>(null);
  const setupSocketRef = useRef<ReturnType<typeof useCallback> | null>(null);
  const socketRef = useRef<{
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
    disconnect: () => void;
    connect: () => void;
  } | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const cancelledRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isInitiatorRef = useRef(false);
  const iceConfigRef = useRef<RTCIceServer[]>([]);
  const remoteIsMutedRef = useRef(remoteIsMuted);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const videoTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const creatingOfferRef = useRef(false);

  // Keep localStream ref in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Keep remote muted state in ref so active speaker detection reads latest value
  useEffect(() => {
    remoteIsMutedRef.current = remoteIsMuted;
  }, [remoteIsMuted]);

  const cleanup = useCallback(() => {
    if (pcRef.current && localStreamRef.current) {
      closePeerConnection(pcRef.current, localStreamRef.current);
      pcRef.current = null;
    }
    pendingCandidatesRef.current.length = 0;
    videoTransceiverRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    if (screenShareStream) {
      screenShareStream.getTracks().forEach((t) => t.stop());
    }
    setScreenShareStream(null);
    if (speakingAnimationRef.current) {
      cancelAnimationFrame(speakingAnimationRef.current);
      speakingAnimationRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsRemoteSpeaking(false);
  }, [screenShareStream]);

  const initMedia = useCallback(
    async (video: boolean) => {
      setMediaError(null);
      try {
        const media = await getLocalMedia(video, true);
        if (cancelledRef.current) {
          media.getTracks().forEach((t) => t.stop());
          return null;
        }
        // If we got no video track (camera missing or audio-only fallback), switch the UI
        // to audio-only mode so we don't show a blank local video tile.
        if (video && media.getVideoTracks().length === 0) {
          setIsAudioOnly(true);
        }
        setLocalStream(media);
        localStreamRef.current = media;
        return media;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not access camera/microphone";
        setMediaError(message);
        // Show toast for permission denial
        toast.error({
          title: "Media access denied",
          body: "Please allow camera and microphone access to join the call.",
        });
        // Post failed call summary if we have a callId
        if (callId) {
          void fetch(`/api/calls/${callId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "end" }),
          }).catch(() => undefined);
        }
        return null;
      }
    },
    [toast, callId],
  );

  const createPC = useCallback(
    (iceServers: RTCIceServer[], localMedia: MediaStream) => {
      const pc = createPeerConnection(iceServers);
      pcRef.current = pc;

      // Add local tracks
      localMedia.getTracks().forEach((track) => {
        pc.addTrack(track, localMedia);
      });

      // Pre-add an inactive video transceiver so m-line order is fixed from
      // the initial offer. When the user later enables the camera, we just
      // replaceTrack() on this transceiver — no renegotiation needed.
      if (callType === "audio" && localMedia.getVideoTracks().length === 0) {
        videoTransceiverRef.current = pc.addTransceiver("video", { direction: "inactive" });
      } else {
        videoTransceiverRef.current = null;
      }

      // Handle remote stream + active speaker detection
      pc.ontrack = (event) => {
        if (!cancelledRef.current) {
          const stream = event.streams[0] ?? null;
          setRemoteStream(stream);
          // Track remote mute state based on audio track enabled status
          if (stream) {
            const audioTracks = stream.getAudioTracks();
            const firstAudio = audioTracks[0];
            setRemoteIsMuted(audioTracks.length > 0 && firstAudio ? !firstAudio.enabled : false);
            // Listen for track end/ mute changes
            audioTracks.forEach((track) => {
              track.addEventListener("ended", () => setRemoteIsMuted(true));
            });

            // Set up audio level monitoring for active speaker detection
            if (audioTracks.length > 0 && typeof AudioContext !== "undefined") {
              try {
                const audioContext = new AudioContext();
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                audioContextRef.current = audioContext;
                analyserRef.current = analyser;

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                const checkSpeaking = () => {
                  if (!analyserRef.current || cancelledRef.current) {
                    setIsRemoteSpeaking(false);
                    return;
                  }
                  analyserRef.current.getByteFrequencyData(dataArray);
                  const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                  setIsRemoteSpeaking((prev) => {
                    const isSpeaking = average > 15 && !remoteIsMutedRef.current;
                    return prev === isSpeaking ? prev : isSpeaking;
                  });
                  speakingAnimationRef.current = requestAnimationFrame(checkSpeaking);
                };
                checkSpeaking();
              } catch {
                // Audio level monitoring not supported
              }
            }
          }
        }
      };

      // Monitor ICE connection state for audio-only fallback
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          // If we're in video mode and ICE fails, try audio-only fallback
          if (!isAudioOnly && callType === "video") {
            console.warn("ICE connection failed, falling back to audio-only");
            setIsAudioOnly(true);
            // Recreate peer connection with audio only
            if (localStreamRef.current) {
              const audioTracks = localStreamRef.current.getAudioTracks();
              const audioStream = new MediaStream(audioTracks);
              setLocalStream(audioStream);
              localStreamRef.current = audioStream;
              // Close the old PC before creating replacement
              if (pcRef.current && pcRef.current !== pc) {
                try {
                  pcRef.current.close();
                } catch {
                  /* already closed */
                }
              }
              // Re-create PC with audio-only stream
              const newPc = createPeerConnection(iceServers);
              pcRef.current = newPc;
              audioTracks.forEach((track) => newPc.addTrack(track, audioStream));
              newPc.ontrack = (e) => {
                if (!cancelledRef.current) {
                  setRemoteStream(e.streams[0] ?? null);
                }
              };
              // Register ICE candidate handler (normally done in setupSocketInner)
              if (socketRef.current) {
                newPc.onicecandidate = (event) => {
                  if (event.candidate) {
                    socketRef.current?.emit("call:ice-candidate", {
                      callId,
                      candidate: event.candidate.toJSON(),
                    });
                  }
                };
              }
              // Re-exchange offer/answer if we're the initiator
              if (isInitiatorRef.current && socketRef.current && !creatingOfferRef.current) {
                creatingOfferRef.current = true;
                createOffer(newPc)
                  .then((offer) => {
                    socketRef.current?.emit("call:offer", {
                      callId,
                      offer,
                      targetUserId: remoteUserId,
                    });
                  })
                  .catch((err) => {
                    console.error("Failed to create offer for ICE fallback:", err);
                  })
                  .finally(() => {
                    creatingOfferRef.current = false;
                  });
              }
            }
          }
        }
      };

      return pc;
    },
    [callId, callType, isAudioOnly, remoteUserId],
  );

  // Use ref to break circular dependency: setupSocket needs to call itself on reconnect
  const setupSocketInner = useCallback(
    (pc: RTCPeerConnection, socket: ReturnType<(typeof import("socket.io-client"))["io"]>) => {
      // Remove all previous handlers to prevent accumulation across reconnects.
      // Socket.IO .on() is additive — without this, N reconnects produce N+1
      // handlers per event, causing duplicate createOffer calls.
      CALL_EVENTS.forEach((event) => socket.off(event));

      socketRef.current = {
        on: socket.on.bind(socket),
        off: socket.off.bind(socket),
        emit: socket.emit.bind(socket),
        disconnect: socket.disconnect.bind(socket),
        connect: socket.connect.bind(socket),
      };

      socket.on("connect", () => {
        setIsReconnecting(false);
        // On reconnect, re-create peer connection and re-negotiate
        if (reconnectAttemptsRef.current > 0 && localStreamRef.current && remoteUserId) {
          const newPc = createPC(iceConfigRef.current, localStreamRef.current);
          setupSocketRef.current?.(newPc, socket);
          if (isInitiatorRef.current && !creatingOfferRef.current) {
            creatingOfferRef.current = true;
            createOffer(newPc)
              .then((offer) => {
                socket.emit("call:offer", {
                  callId,
                  offer,
                  targetUserId: remoteUserId,
                });
              })
              .catch((err) => {
                console.error("Failed to create offer on reconnect:", err);
              })
              .finally(() => {
                creatingOfferRef.current = false;
              });
          }
        }
        reconnectAttemptsRef.current = 0;
      });

      socket.on("disconnect", () => {
        setIsReconnecting(true);
        // Auto-reconnect within 30s
        if (reconnectAttemptsRef.current < 10) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * reconnectAttemptsRef.current, 30000);
          reconnectTimerRef.current = setTimeout(() => {
            if (!cancelledRef.current && !socket.connected) {
              socket.connect();
            }
          }, delay);
        }
      });

      socket.on("connect_error", (err) => {
        console.error("Socket connect_error:", err.message);
        setIsReconnecting(true);
      });

      // Handle incoming offer (we are the callee)
      socket.on("call:offer", async (data: unknown) => {
        const { sdp, fromUserId } = data as {
          sdp: string;
          fromUserId: string;
        };
        if (!pcRef.current || cancelledRef.current) return;
        try {
          const offer = JSON.parse(sdp) as RTCSessionDescriptionInit;
          const answer = await createAnswer(pcRef.current, offer);
          // Flush ICE candidates that arrived before setRemoteDescription
          for (const c of pendingCandidatesRef.current) {
            await addIceCandidate(pcRef.current, c);
          }
          pendingCandidatesRef.current.length = 0;
          socket.emit("call:answer", {
            callId,
            answer,
            targetUserId: fromUserId,
          });
        } catch {
          console.error("Failed to handle offer");
        }
      });

      // Handle incoming answer (we are the caller)
      socket.on("call:answer", async (data: unknown) => {
        const { sdp } = data as { sdp: string };
        if (!pcRef.current || cancelledRef.current) return;
        try {
          const answer = JSON.parse(sdp) as RTCSessionDescriptionInit;
          await handleAnswer(pcRef.current, answer);
          // Flush ICE candidates that arrived before setRemoteDescription
          for (const c of pendingCandidatesRef.current) {
            await addIceCandidate(pcRef.current, c);
          }
          pendingCandidatesRef.current.length = 0;
        } catch {
          console.error("Failed to handle answer");
        }
      });

      // Handle ICE candidates — queue until remoteDescription is set
      socket.on("call:ice-candidate", async (data: unknown) => {
        const { candidate: candidateStr } = data as { candidate: string };
        if (!pcRef.current || cancelledRef.current) return;
        try {
          const candidate = JSON.parse(candidateStr) as RTCIceCandidateInit;
          if (pcRef.current.remoteDescription) {
            await addIceCandidate(pcRef.current, candidate);
          } else {
            pendingCandidatesRef.current.push(candidate);
          }
        } catch {
          console.error("Failed to add ICE candidate");
        }
      });

      // Handle call ended by remote
      socket.on("call:ended", () => {
        if (!cancelledRef.current) {
          setMediaError("Call ended");
          toast.info({ title: "Call ended", body: "The other participant ended the call." });
          cleanup();
        }
      });

      // Handle call rejected
      socket.on("call:rejected", () => {
        if (!cancelledRef.current) {
          setMediaError("Call rejected");
          toast.info({ title: "Call rejected", body: "The call was declined." });
          cleanup();
        }
      });

      // Handle call cancelled
      socket.on("call:cancelled", () => {
        if (!cancelledRef.current) cleanup();
      });

      // Handle call timed out
      socket.on("call:timed_out", async () => {
        if (!cancelledRef.current) {
          setMediaError("Call timed out — no answer after 30 seconds");
          toast.error({ title: "Call timed out", body: "No one answered after 30 seconds." });
          // Mark as missed call
          if (callId) {
            void fetch(`/api/calls/${callId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "timeout" }),
            }).catch(() => undefined);
          }
          cleanup();
        }
      });

      // Handle call unavailable (target has zero sockets)
      socket.on("call:unavailable", () => {
        if (!cancelledRef.current) {
          setMediaError("The person you called is not reachable right now.");
          toast.error({
            title: "User unavailable",
            body: "The person you called is not reachable right now.",
          });
          cleanup();
        }
      });

      // Send ICE candidates to remote
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("call:ice-candidate", {
            callId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // --- Role-based offer/answer sequencing ---
      // The caller waits for call:ready before creating an offer.
      // The callee emits call:ready once its socket is connected, so the
      // offer arrives when the callee's page is live and listening.
      if (role === "caller") {
        isInitiatorRef.current = true;
        socket.on("call:ready", async () => {
          if (cancelledRef.current || !pcRef.current || creatingOfferRef.current) return;
          creatingOfferRef.current = true;
          try {
            const offer = await createOffer(pcRef.current);
            socket.emit("call:offer", {
              callId,
              offer,
              targetUserId: remoteUserId,
            });
          } catch (err) {
            console.error("Failed to create offer on call:ready:", err);
          } finally {
            creatingOfferRef.current = false;
          }
        });
      } else {
        // Callee: signal readiness to the caller.
        // Emit immediately AND retry after 1s to guard against the race
        // where the caller's call:ready listener isn't registered yet.
        const emitReady = () => socket.emit("call:ready", { callId });
        emitReady();
        const retryTimer = setTimeout(emitReady, 1000);
        socket.on("disconnect", () => clearTimeout(retryTimer));
      }
    },
    [callId, cleanup, createPC, remoteUserId, role, toast],
  );

  const setupSocket = useCallback(
    (pc: RTCPeerConnection, socket: ReturnType<(typeof import("socket.io-client"))["io"]>) => {
      setupSocketRef.current = setupSocketInner;
      return setupSocketInner(pc, socket);
    },
    [setupSocketInner],
  );

  // Initialize: get local media, fetch ICE config, create peer connection
  useEffect(() => {
    if (!callId) return;

    cancelledRef.current = false;
    let pc: RTCPeerConnection | null = null;
    let localMedia: MediaStream | null = null;
    let socket: ReturnType<(typeof import("socket.io-client"))["io"]> | null = null;

    const init = async () => {
      // Group calls use SFU (LiveKit) — skip WebRTC mesh setup
      if (sfuRoomId && sfuToken) {
        setMediaError(null);
        setLocalStream(null);
        setRemoteStream(null);
        setRemoteIsMuted(false);
        return;
      }

      try {
        // Get local media
        const effectiveVideo = callType === "video" && !isAudioOnly;
        localMedia = await initMedia(effectiveVideo);
        if (cancelledRef.current) {
          localMedia?.getTracks().forEach((t) => t.stop());
          return;
        }
        if (!localMedia) return; // media error already set

        // Fetch ICE config from server
        const iceRes = await fetch("/api/calls/ice-config");
        const iceConfig = await iceRes.json();
        iceConfigRef.current = iceConfig.iceServers ?? [];
        if (cancelledRef.current) return;

        // Create peer connection
        pc = createPC(iceConfig.iceServers ?? [], localMedia);

        // Connect to signaling server with proper auth
        const { io } = await import("socket.io-client");
        const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_WS_URL || window.location.origin;
        socket = io(realtimeUrl, {
          transports: ["polling", "websocket"],
          auth: async (cb: (auth: { token: string }) => void) => {
            try {
              const res = await fetch("/api/realtime/token", { credentials: "include" });
              if (!res.ok) throw new Error("token fetch failed");
              const { token } = (await res.json()) as { token: string };
              cb({ token });
            } catch {
              cb({ token: "" });
            }
          },
        });

        setupSocket(pc, socket);
      } catch (err) {
        console.error("Failed to initialize call:", err);
        setMediaError("Failed to initialize call. Please try again.");
        toast.error({
          title: "Call failed",
          body: "Could not initialize the call. Please try again.",
        });
        if (callId) {
          void fetch(`/api/calls/${callId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "end" }),
          }).catch(() => undefined);
        }
      }
    };

    // Store setupSocket in ref for reconnection use
    setupSocketRef.current = setupSocket;
    void init();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      cleanup();
    };
  }, [
    callId,
    callType,
    isAudioOnly,
    sfuRoomId,
    sfuToken,
    livekitUrl,
    initMedia,
    createPC,
    setupSocket,
    cleanup,
    toast,
  ]);

  const handleRetry = useCallback(async () => {
    setIsAudioOnly(false);
    setMediaError(null);
    setIsRemoteSpeaking(false);
    cleanup();
    // Clean re-init: reset state and let the effect re-run
    setRemoteStream(null);
    setLocalStream(null);
    setRemoteIsMuted(false);
    setScreenShareStream(null);
  }, [cleanup]);

  const handleToggleScreenShare = useCallback(async () => {
    if (screenShareStream) {
      screenShareStream.getTracks().forEach((t) => t.stop());
      setScreenShareStream(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setScreenShareStream(stream);
      // Listen for when user stops sharing via browser UI
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenShareStream(null);
      });
    } catch {
      // User cancelled or error — ignore
    }
  }, [screenShareStream]);

  const handleDeviceChange = useCallback(
    async (kind: DeviceKind, deviceId: string) => {
      if (!localStream || !pcRef.current) return;
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          [kind === "audioinput" ? "audio" : "video"]: { deviceId: { exact: deviceId } },
          [kind === "videoinput" ? "audio" : "video"]: true,
        });
        const newTrack = newStream.getTracks()[0];
        const oldTracks =
          kind === "audioinput" ? localStream.getAudioTracks() : localStream.getVideoTracks();
        const oldTrack = oldTracks[0];
        if (oldTrack && newTrack) {
          const sender = pcRef.current.getSenders().find((s) => s.track === oldTrack);
          if (sender) {
            await sender.replaceTrack(newTrack);
          }
          oldTrack.stop();
          const updatedStream = new MediaStream([
            ...(kind === "audioinput"
              ? localStream.getVideoTracks()
              : localStream.getAudioTracks()),
            newTrack,
          ]);
          setLocalStream(updatedStream);
        }
        newStream.getTracks().forEach((t) => {
          if (t !== newTrack) t.stop();
        });
      } catch {
        // Device change failed silently
      }
    },
    [localStream],
  );

  const handleEnableCamera = useCallback(async () => {
    if (!pcRef.current || !localStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return;
      // Use the saved video transceiver reference (set during createPC for audio calls).
      // The addTrack fallback is removed because it creates a new transceiver that
      // appends a third m-line, breaking the m-line order from the initial offer/answer.
      const videoTransceiver = videoTransceiverRef.current;
      if (!videoTransceiver) {
        console.error("No video transceiver available — cannot enable camera");
        return;
      }
      await videoTransceiver.sender.replaceTrack(videoTrack);
      // Change direction so the remote peer starts receiving video
      videoTransceiver.direction = "sendrecv";
      // Merge into local stream
      const updatedStream = new MediaStream([
        ...localStreamRef.current.getAudioTracks(),
        videoTrack,
      ]);
      setLocalStream(updatedStream);
      localStreamRef.current = updatedStream;
      setIsAudioOnly(false);
      // Notify remote peer to renegotiate
      if (socketRef.current && !creatingOfferRef.current) {
        creatingOfferRef.current = true;
        try {
          const offer = await createOffer(pcRef.current);
          socketRef.current.emit("call:offer", {
            callId,
            offer,
            targetUserId: remoteUserId,
          });
        } catch (err) {
          console.error("Failed to create offer for camera enable:", err);
        } finally {
          creatingOfferRef.current = false;
        }
      }
    } catch {
      // Camera access denied or failed — stay in audio-only
    }
  }, [callId, remoteUserId]);

  const handleEndCall = useCallback(async () => {
    // Notify remote that call ended
    socketRef.current?.emit("call:end", { callId });
    // Persist the end status via API. Use keepalive so the PATCH survives the
    // popup closing (RC1); await it so it has a chance to complete before unload.
    try {
      await fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
        keepalive: true,
      });
    } catch {
      // Best-effort: if the fetch still fails, the heartbeat sweep will reap it.
    }
    cleanup();
    window.close();
  }, [callId, cleanup]);

  // Send a synchronous unload-safe end request when the window closes via the
  // OS/browser X (RC2). keepalive lets the PATCH outlive the document.
  const handleUnloadEnd = useCallback(() => {
    if (!callId) return;
    try {
      fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Ignore; sweep is the safety net.
    }
  }, [callId]);

  // Heartbeat while the call window is open (RC3). The server ignores beats sent
  // before the call is active, and the sweep reaps active calls that stop beating.
  useEffect(() => {
    if (!callId) return;

    const sendHeartbeat = () => {
      fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat" }),
        keepalive: true,
      }).catch(() => undefined);
    };

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 15_000);

    return () => clearInterval(heartbeatInterval);
  }, [callId]);

  // Unload handler: end the call if the window closes without using the hang-up
  // button (RC2). Prefer pagehide where available; fall back to beforeunload.
  useEffect(() => {
    window.addEventListener("pagehide", handleUnloadEnd);
    window.addEventListener("beforeunload", handleUnloadEnd);
    return () => {
      window.removeEventListener("pagehide", handleUnloadEnd);
      window.removeEventListener("beforeunload", handleUnloadEnd);
    };
  }, [handleUnloadEnd]);

  if (!callId) {
    return <div style={{ padding: 24, textAlign: "center" }}>Missing call ID</div>;
  }

  // Group call via LiveKit SFU (CALL-3)
  if (livekitUrl && sfuRoomId && sfuToken) {
    return (
      <LiveKitGroupCall
        roomId={sfuRoomId}
        token={sfuToken}
        livekitUrl={livekitUrl}
        callId={callId}
        localUserId={remoteUserId || "local"}
        onEndCall={handleEndCall}
      />
    );
  }

  return (
    <CallWindow
      callId={callId}
      localStream={localStream}
      remoteStream={remoteStream}
      remoteName={remoteName}
      remoteUserId={remoteUserId}
      remoteIsMuted={remoteIsMuted}
      isRemoteSpeaking={isRemoteSpeaking}
      onEndCall={handleEndCall}
      mediaError={mediaError}
      onRetryMedia={handleRetry}
      isAudioOnly={isAudioOnly}
      isReconnecting={isReconnecting}
      onDeviceChange={handleDeviceChange}
      sfuRoomId={sfuRoomId}
      sfuToken={sfuToken}
      isScreenSharing={!!screenShareStream}
      onToggleScreenShare={handleToggleScreenShare}
      screenShareStream={screenShareStream}
      localUserName={localUserName}
      onEnableCamera={handleEnableCamera}
    />
  );
}

export default function CallPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center" }}>Loading...</div>}>
      <CallPageInner />
    </Suspense>
  );
}
