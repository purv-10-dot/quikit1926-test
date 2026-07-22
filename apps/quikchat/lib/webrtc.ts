/**
 * WebRTC helper functions for 1:1 calls. Wraps the browser's RTCPeerConnection
 * API with a clean interface for offer/answer exchange via signaling.
 */

export interface CallPeerConnection {
  pc: RTCPeerConnection;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

/**
 * Create a new RTCPeerConnection with ICE and transport configuration.
 *
 * - bundlePolicy "max-bundle" multiplexes all media on one port (fewer NAT mappings).
 * - iceCandidatePoolSize 2 pre-gathers candidates for faster connection setup.
 * - rtcpMuxPolicy "require" multiplexes RTP/RTCP (standard practice).
 */
export function createPeerConnection(iceServers: RTCIceServer[]): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers,
    bundlePolicy: "max-bundle",
    iceCandidatePoolSize: 2,
    rtcpMuxPolicy: "require",
  });
}

/**
 * Get local media stream (camera + mic, or mic-only for audio calls).
 *
 * Video is capped at 720p@30fps to conserve bandwidth over TURN relay.
 * Audio always enables echo cancellation, noise suppression, and auto gain.
 *
 * If the camera is unavailable (NotFoundError / NotReadableError) we
 * gracefully fall back to an audio-only stream instead of throwing.
 */
export async function getLocalMedia(
  video = true,
  audio = true,
  fallbackToAudio = true,
): Promise<MediaStream> {
  const audioConstraint = audio
    ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    : false;

  const videoConstraint = video
    ? { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 30 } }
    : false;

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraint,
      audio: audioConstraint,
    });
  } catch (err) {
    const isVideoHardwareError =
      err instanceof DOMException &&
      (err.name === "NotFoundError" ||
        err.name === "NotReadableError" ||
        err.name === "DevicesNotFoundError");

    if (fallbackToAudio && video && isVideoHardwareError) {
      return navigator.mediaDevices.getUserMedia({
        video: false,
        audio: audioConstraint,
      });
    }

    throw err;
  }
}

/**
 * Create an SDP offer. Only succeeds when the PC is in "stable" state
 * (no pending offer/answer). Throws otherwise to prevent m-line order errors.
 */
export async function createOffer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  // Guard: only create offers in "stable" state. Skip check if signalingState is
  // undefined (happens in jsdom test mocks that don't implement it).
  if (pc.signalingState !== undefined && pc.signalingState !== "stable") {
    throw new Error(`Cannot create offer in signalingState: ${pc.signalingState}`);
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return pc.localDescription!;
}

/**
 * Create an SDP answer in response to an offer.
 */
export async function createAnswer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescriptionInit,
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return pc.localDescription!;
}

/**
 * Handle an incoming SDP answer.
 */
export async function handleAnswer(
  pc: RTCPeerConnection,
  answer: RTCSessionDescriptionInit,
): Promise<void> {
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

/**
 * Add an ICE candidate.
 */
export async function addIceCandidate(
  pc: RTCPeerConnection,
  candidate: RTCIceCandidateInit,
): Promise<void> {
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

/**
 * Close a peer connection and stop all tracks.
 */
export function closePeerConnection(pc: RTCPeerConnection, localStream: MediaStream | null): void {
  localStream?.getTracks().forEach((t) => t.stop());
  pc.close();
}
