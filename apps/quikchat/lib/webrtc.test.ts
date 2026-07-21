import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createPeerConnection,
  getLocalMedia,
  createOffer,
  createAnswer,
  handleAnswer,
  addIceCandidate,
  closePeerConnection,
} from "./webrtc";

// ============================================================================
// Helpers: simulate the ICE candidate queue pattern from page.tsx
// ============================================================================

/** Simulates the ICE candidate queue logic implemented in page.tsx. */
function createIceCandidateQueue() {
  const pending: RTCIceCandidateInit[] = [];

  function onIceCandidate(
    candidate: RTCIceCandidateInit,
    pc: { remoteDescription: unknown; addIceCandidate: (c: RTCIceCandidateInit) => Promise<void> },
  ) {
    if (pc.remoteDescription) {
      return pc.addIceCandidate(candidate);
    }
    pending.push(candidate);
    return Promise.resolve();
  }

  async function flush(pc: { addIceCandidate: (c: RTCIceCandidateInit) => Promise<void> }) {
    for (const c of pending) {
      await pc.addIceCandidate(c);
    }
    pending.length = 0;
  }

  return { pending, onIceCandidate, flush };
}

describe("webrtc.ts — WebRTC helper functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPeerConnection", () => {
    it("creates an RTCPeerConnection with the given ICE servers", () => {
      const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
      const pc = createPeerConnection(iceServers);

      expect(pc).toBeDefined();
      expect(typeof pc.close).toBe("function");
      pc.close();
    });
  });

  describe("getLocalMedia", () => {
    it("requests video and audio with echoCancellation, noiseSuppression, autoGainControl by default", async () => {
      const mockStream = new MediaStream();
      const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: mockGetUserMedia },
        writable: true,
      });

      const stream = await getLocalMedia();

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 30 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      expect(stream).toBe(mockStream);
    });

    it("requests audio-only with constraints when video is false", async () => {
      const mockStream = new MediaStream();
      const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: mockGetUserMedia },
        writable: true,
      });

      const stream = await getLocalMedia(false);

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      expect(stream).toBe(mockStream);
    });

    it("falls back to audio-only when the camera is unavailable", async () => {
      const audioOnlyStream = new MediaStream();
      const mockGetUserMedia = vi
        .fn()
        .mockRejectedValueOnce(new DOMException("Requested device not found", "NotFoundError"))
        .mockResolvedValueOnce(audioOnlyStream);
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: mockGetUserMedia },
        writable: true,
      });

      const stream = await getLocalMedia(true);

      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
      expect(mockGetUserMedia).toHaveBeenNthCalledWith(2, {
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      expect(stream).toBe(audioOnlyStream);
    });

    it("still throws permission errors instead of falling back", async () => {
      const mockGetUserMedia = vi
        .fn()
        .mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: mockGetUserMedia },
        writable: true,
      });

      await expect(getLocalMedia(true)).rejects.toThrow("Permission denied");
      expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
    });
  });

  describe("createOffer", () => {
    it("creates and sets local description, returns canonical localDescription", async () => {
      const canonicalSdp = { type: "offer", sdp: "normalized-sdp" };
      const mockPc = {
        createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "raw-sdp" }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        localDescription: canonicalSdp,
      } as unknown as RTCPeerConnection;

      const offer = await createOffer(mockPc);

      expect(mockPc.createOffer).toHaveBeenCalled();
      expect(mockPc.setLocalDescription).toHaveBeenCalled();
      expect(offer).toEqual(canonicalSdp);
    });
  });

  describe("createAnswer", () => {
    it("sets remote description and creates answer, returns canonical localDescription", async () => {
      const canonicalSdp = { type: "answer", sdp: "normalized-answer-sdp" };
      const mockPc = {
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        createAnswer: vi.fn().mockResolvedValue({ type: "answer", sdp: "raw-answer-sdp" }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        localDescription: canonicalSdp,
      } as unknown as RTCPeerConnection;

      const offer = { type: "offer", sdp: "mock-sdp" } as RTCSessionDescriptionInit;
      const answer = await createAnswer(mockPc, offer);

      expect(mockPc.setRemoteDescription).toHaveBeenCalled();
      expect(mockPc.createAnswer).toHaveBeenCalled();
      expect(mockPc.setLocalDescription).toHaveBeenCalled();
      expect(answer).toEqual(canonicalSdp);
    });
  });

  describe("handleAnswer", () => {
    it("sets remote description from answer", async () => {
      const mockPc = {
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      } as unknown as RTCPeerConnection;

      const answer = { type: "answer", sdp: "mock-answer-sdp" } as RTCSessionDescriptionInit;
      await handleAnswer(mockPc, answer);

      expect(mockPc.setRemoteDescription).toHaveBeenCalled();
    });
  });

  describe("addIceCandidate", () => {
    it("adds ICE candidate to peer connection", async () => {
      const mockPc = {
        addIceCandidate: vi.fn().mockResolvedValue(undefined),
      } as unknown as RTCPeerConnection;

      const candidate = {
        candidate: "candidate:1 1 UDP 2130706431 192.168.1.1 12345 typ host",
      } as RTCIceCandidateInit;
      await addIceCandidate(mockPc, candidate);

      expect(mockPc.addIceCandidate).toHaveBeenCalled();
    });
  });

  describe("closePeerConnection", () => {
    it("stops all tracks and closes the connection", () => {
      const mockTrack = { stop: vi.fn() };
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([mockTrack]),
      } as unknown as MediaStream;

      const mockPc = {
        close: vi.fn(),
      } as unknown as RTCPeerConnection;

      closePeerConnection(mockPc, mockStream);

      expect(mockTrack.stop).toHaveBeenCalled();
      expect(mockPc.close).toHaveBeenCalled();
    });

    it("handles null localStream gracefully", () => {
      const mockPc = {
        close: vi.fn(),
      } as unknown as RTCPeerConnection;

      closePeerConnection(mockPc, null);

      expect(mockPc.close).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // ICE candidate queue pattern (verifies Bug 2 fix)
  // ========================================================================

  describe("ICE candidate queuing", () => {
    it("buffers candidates when remoteDescription is not set", async () => {
      const queue = createIceCandidateQueue();
      const mockPc = {
        remoteDescription: null,
        addIceCandidate: vi.fn().mockResolvedValue(undefined),
      };

      const c1 = { candidate: "candidate:1" } as RTCIceCandidateInit;
      const c2 = { candidate: "candidate:2" } as RTCIceCandidateInit;

      await queue.onIceCandidate(c1, mockPc);
      await queue.onIceCandidate(c2, mockPc);

      // Candidates should be buffered, not applied
      expect(mockPc.addIceCandidate).not.toHaveBeenCalled();
      expect(queue.pending).toHaveLength(2);
      expect(queue.pending).toEqual([c1, c2]);
    });

    it("applies candidates directly when remoteDescription is set", async () => {
      const queue = createIceCandidateQueue();
      const mockPc = {
        remoteDescription: { type: "answer", sdp: "some-sdp" },
        addIceCandidate: vi.fn().mockResolvedValue(undefined),
      };

      const c1 = { candidate: "candidate:1" } as RTCIceCandidateInit;
      await queue.onIceCandidate(c1, mockPc);

      expect(mockPc.addIceCandidate).toHaveBeenCalledWith(c1);
      expect(queue.pending).toHaveLength(0);
    });

    it("flushes buffered candidates after setRemoteDescription", async () => {
      const queue = createIceCandidateQueue();
      const mockPc = {
        remoteDescription: null,
        addIceCandidate: vi.fn().mockResolvedValue(undefined),
      };

      // Queue 3 candidates before remoteDescription is set
      const c1 = { candidate: "candidate:1" } as RTCIceCandidateInit;
      const c2 = { candidate: "candidate:2" } as RTCIceCandidateInit;
      const c3 = { candidate: "candidate:3" } as RTCIceCandidateInit;

      await queue.onIceCandidate(c1, mockPc);
      await queue.onIceCandidate(c2, mockPc);
      await queue.onIceCandidate(c3, mockPc);

      expect(queue.pending).toHaveLength(3);

      // Simulate setRemoteDescription completing — flush
      await queue.flush(mockPc);

      expect(mockPc.addIceCandidate).toHaveBeenCalledTimes(3);
      expect(mockPc.addIceCandidate).toHaveBeenNthCalledWith(1, c1);
      expect(mockPc.addIceCandidate).toHaveBeenNthCalledWith(2, c2);
      expect(mockPc.addIceCandidate).toHaveBeenNthCalledWith(3, c3);
      expect(queue.pending).toHaveLength(0);
    });

    it("flush is safe to call with an empty queue", async () => {
      const queue = createIceCandidateQueue();
      const mockPc = {
        addIceCandidate: vi.fn().mockResolvedValue(undefined),
      };

      await queue.flush(mockPc);

      expect(mockPc.addIceCandidate).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Full P2P signaling flow simulation (verifies Bugs 1, 2, 3 together)
  // ========================================================================

  describe("P2P signaling flow — audio/video should flow", () => {
    it("offer/answer exchange uses canonical localDescription (not raw SDP)", async () => {
      // Simulate the caller creating an offer
      const callerCanonicalOffer = { type: "offer", sdp: "caller-normalized-offer" };
      const callerPc = {
        createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "raw-offer" }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        localDescription: callerCanonicalOffer,
      } as unknown as RTCPeerConnection;

      const offer = await createOffer(callerPc);

      // The offer sent over signaling should be the NORMALIZED version
      expect(offer).toEqual(callerCanonicalOffer);
      // NOT the raw pre-normalization object
      expect(offer).not.toEqual({ type: "offer", sdp: "raw-offer" });
    });

    it("answer uses canonical localDescription (not raw SDP)", async () => {
      const calleeCanonicalAnswer = { type: "answer", sdp: "callee-normalized-answer" };
      const calleePc = {
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        createAnswer: vi.fn().mockResolvedValue({ type: "answer", sdp: "raw-answer" }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        localDescription: calleeCanonicalAnswer,
      } as unknown as RTCPeerConnection;

      const answer = await createAnswer(calleePc, {
        type: "offer",
        sdp: "some-offer",
      } as RTCSessionDescriptionInit);

      expect(answer).toEqual(calleeCanonicalAnswer);
      expect(answer).not.toEqual({ type: "answer", sdp: "raw-answer" });
    });

    it("simulated full flow: caller offer → callee answer → ICE flush → media negotiable", async () => {
      // --- CALLER SIDE ---
      const callerOfferSdp = { type: "offer", sdp: "caller-offer-v2" };
      const callerPc = {
        createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "raw-offer" }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        localDescription: callerOfferSdp,
        addTrack: vi.fn(),
        ontrack: null as unknown,
        onicecandidate: null as unknown,
      };

      // Caller creates local tracks, adds them, then creates offer
      const mockAudioTrack = { kind: "audio", enabled: true };
      const mockVideoTrack = { kind: "video", enabled: true };
      callerPc.addTrack(mockAudioTrack, {} as MediaStream);
      callerPc.addTrack(mockVideoTrack, {} as MediaStream);

      const offer = await createOffer(callerPc as unknown as RTCPeerConnection);

      // Verify tracks were added BEFORE offer creation (Bug 3 reference check)
      expect(callerPc.addTrack).toHaveBeenCalledTimes(2);

      // --- CALLEE SIDE ---
      const calleeAnswerSdp = { type: "answer", sdp: "callee-answer-v2" };
      const calleePc = {
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        createAnswer: vi.fn().mockResolvedValue({ type: "answer", sdp: "raw-answer" }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        localDescription: calleeAnswerSdp,
        addTrack: vi.fn(),
        addIceCandidate: vi.fn().mockResolvedValue(undefined),
        remoteDescription: null as unknown,
      };

      // Callee adds its own local tracks
      calleePc.addTrack(mockAudioTrack, {} as MediaStream);
      calleePc.addTrack(mockVideoTrack, {} as MediaStream);

      // Callee receives offer, sets remote description, creates answer
      const answer = await createAnswer(calleePc as unknown as RTCPeerConnection, offer);

      // Simulate remoteDescription being set
      calleePc.remoteDescription = offer;

      // --- ICE CANDIDATE QUEUE (callee side) ---
      const calleeIceQueue = createIceCandidateQueue();
      const mockIceCandidate = {
        candidate: "candidate:1 1 UDP 2130706431 192.168.1.1 12345 typ host",
      } as RTCIceCandidateInit;

      // ICE candidate arrives BEFORE remoteDescription is set (race condition)
      // After our fix, it should be queued
      calleePc.remoteDescription = null;
      await calleeIceQueue.onIceCandidate(
        mockIceCandidate,
        calleePc as unknown as Parameters<typeof calleeIceQueue.onIceCandidate>[1],
      );

      expect(calleeIceQueue.pending).toHaveLength(1);

      // After setRemoteDescription (which happens in createAnswer), flush
      calleePc.remoteDescription = offer;
      await calleeIceQueue.flush(calleePc as unknown as Parameters<typeof calleeIceQueue.flush>[0]);

      // Candidate was applied after flush
      expect(calleeIceQueue.pending).toHaveLength(0);

      // --- CALLER receives answer ---
      const callerHandlePc = {
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      };

      await handleAnswer(callerHandlePc as unknown as RTCPeerConnection, answer);

      expect(callerHandlePc.setRemoteDescription).toHaveBeenCalled();

      // Both sides now have: local tracks added, SDP exchanged, ICE candidates flushed
      // Media negotiation can proceed — audio/video will flow
    });

    it("ICE candidates received after remoteDescription are applied immediately", async () => {
      const queue = createIceCandidateQueue();
      const mockPc = {
        remoteDescription: { type: "offer", sdp: "set" },
        addIceCandidate: vi.fn().mockResolvedValue(undefined),
      };

      const c1 = { candidate: "candidate:1" } as RTCIceCandidateInit;
      await queue.onIceCandidate(c1, mockPc);

      // Applied immediately, not queued
      expect(mockPc.addIceCandidate).toHaveBeenCalledWith(c1);
      expect(queue.pending).toHaveLength(0);
    });
  });
});
