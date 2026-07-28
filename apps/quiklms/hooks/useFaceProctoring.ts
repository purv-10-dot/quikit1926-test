'use client';
/**
 * Face proctoring (webcam + MediaPipe FaceLandmarker).
 *
 * Ported from the old QuikSkills frontend. MediaPipe (@mediapipe/tasks-vision)
 * is NOT a dependency of this app, so this hook DEGRADES GRACEFULLY:
 *   - It attempts a runtime dynamic import of '@mediapipe/tasks-vision'.
 *   - If the module is absent (the common case here), it reports faceStatus
 *     'unavailable' and becomes a no-op — no webcam is requested, no crash,
 *     and DOM-event proctoring (the other hooks) keeps working.
 *   - If a consumer later adds the dep, full face detection lights up with no
 *     code change.
 *
 * When active it posts violations to the quiz-proctoring backend:
 *   POST /api/quiz-proctoring/:sessionId/event   { eventType, metadata }
 *
 * The import is intentionally indirect (computed specifier) so the bundler does
 * not hard-fail at build time on the missing optional module.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';

export type FaceStatus =
  | 'initializing'
  | 'unavailable'
  | 'ok'
  | 'no_face'
  | 'multiple'
  | 'looking_away'
  | 'looking_down'
  | 'eyes_closed'
  | 'too_far'
  | 'camera_error';

export interface FaceProctoringReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  isReady: boolean;
  /** true when MediaPipe could not be loaded — face detection is a no-op */
  unavailable: boolean;
  cameraError: string | null;
  faceStatus: FaceStatus;
}

interface FaceProctoringOptions {
  sessionId: string | null;
  enabled: boolean;
  onWarning?: (message: string) => void;
}

const GRACE_MS: Record<string, number> = {
  face_no_face: 8_000,
  face_multiple: 2_000,
  face_looking_away: 7_000,
  face_looking_down: 7_000,
  face_eyes_closed: 5_000,
  face_too_far: 10_000,
};

const DEBOUNCE_MS: Record<string, number> = {
  face_no_face: 30_000,
  face_multiple: 20_000,
  face_looking_away: 20_000,
  face_looking_down: 20_000,
  face_eyes_closed: 20_000,
  face_too_far: 40_000,
};

const WARN_MSGS: Record<string, string> = {
  face_no_face: 'Face not detected — please stay in front of the camera.',
  face_multiple: 'Multiple faces detected — this has been logged.',
  face_looking_away: 'Please face the camera directly.',
  face_looking_down: 'Please look at the screen, not downward.',
  face_eyes_closed: 'Please keep your eyes on the screen.',
  face_too_far: 'Please move closer to the camera.',
};

// Literal dynamic import so the bundler resolves and code-splits MediaPipe:
// it is only fetched when a proctored quiz actually starts, not on first paint.
//
// It must be a LITERAL specifier. A computed specifier with `webpackIgnore`
// leaves a bare `import('@mediapipe/tasks-vision')` for the browser to resolve
// at runtime, which it cannot do — that threw, was swallowed, and silently
// disabled face proctoring entirely.
//
// The try/catch still keeps face proctoring optional at runtime: if the chunk
// fails to load we degrade to DOM-only proctoring rather than blocking the quiz.
async function loadMediaPipe(): Promise<{
  FaceLandmarker: unknown;
  FilesetResolver: unknown;
} | null> {
  try {
    const mod = await import('@mediapipe/tasks-vision');
    if (mod?.FaceLandmarker && mod?.FilesetResolver) {
      return { FaceLandmarker: mod.FaceLandmarker, FilesetResolver: mod.FilesetResolver };
    }
    return null;
  } catch {
    return null;
  }
}

export function useFaceProctoring({ sessionId, enabled, onWarning }: FaceProctoringOptions): FaceProctoringReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('initializing');

  const sessionIdRef = useRef(sessionId);
  const enabledRef = useRef(enabled);
  const onWarningRef = useRef(onWarning);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    onWarningRef.current = onWarning;
  }, [onWarning]);

  const landmarkerRef = useRef<{ detectForVideo: (v: HTMLVideoElement, t: number) => unknown; close: () => void } | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const violationStartRef = useRef<Record<string, number | null>>({});
  const lastFiredRef = useRef<Record<string, number>>({});

  const eventQueueRef = useRef<{ eventType: string; metadata?: unknown }[]>([]);
  const flushingRef = useRef(false);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || !sessionIdRef.current || eventQueueRef.current.length === 0) return;
    flushingRef.current = true;
    while (eventQueueRef.current.length > 0) {
      const evt = eventQueueRef.current.shift()!;
      try {
        await api.post(`/quiz-proctoring/${sessionIdRef.current}/event`, evt);
      } catch (err) {
        console.error('[FaceProctoring] Failed to send event:', err);
      }
    }
    flushingRef.current = false;
  }, []);

  const sendEvent = useRef((eventType: string, metadata?: unknown) => {
    if (!sessionIdRef.current || !enabledRef.current) return;
    eventQueueRef.current.push({ eventType, metadata });
    void flushQueue();
  });

  const checkViolation = useCallback((type: string, detected: boolean, metadata?: Record<string, unknown>) => {
    const now = Date.now();
    if (detected) {
      if (violationStartRef.current[type] == null) {
        violationStartRef.current[type] = now;
      }
      const elapsed = now - violationStartRef.current[type]!;
      const lastFired = lastFiredRef.current[type] ?? 0;
      const grace = GRACE_MS[type] ?? 3_000;
      const debounce = DEBOUNCE_MS[type] ?? 10_000;

      if (elapsed >= grace && now - lastFired >= debounce) {
        lastFiredRef.current[type] = now;
        sendEvent.current(type, { ...metadata, elapsed_ms: elapsed });
        onWarningRef.current?.(WARN_MSGS[type]);
      }
    } else {
      violationStartRef.current[type] = null;
    }
  }, []);

  // Head pose from face landmarks (geometric, no matrix needed).
  function getHeadPose(lm: { x: number; y: number; z: number }[]) {
    const noseTip = lm[1];
    const chin = lm[152];
    const leftEye = lm[33];
    const rightEye = lm[263];
    const leftEar = lm[234];
    const rightEar = lm[454];

    const earMidX = (leftEar.x + rightEar.x) / 2;
    const earDistance = Math.abs(rightEar.x - leftEar.x);
    const yaw = earDistance > 0.001 ? ((noseTip.x - earMidX) / earDistance) * 90 : 0;

    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    const faceHeight = Math.abs(chin.y - eyeMidY);
    const pitch = faceHeight > 0.001 ? ((noseTip.y - eyeMidY) / faceHeight) * 90 : 0;

    return { yaw, pitch };
  }

  const runDetectionRef = useRef<() => void>();
  runDetectionRef.current = () => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !landmarker || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(() => runDetectionRef.current?.());
      return;
    }

    try {
      const result = landmarker.detectForVideo(video, performance.now()) as {
        faceLandmarks?: { x: number; y: number; z: number }[][];
        faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
      };
      const faces = result.faceLandmarks ?? [];
      const blendshapes = result.faceBlendshapes ?? [];

      checkViolation('face_no_face', faces.length === 0);
      if (faces.length === 0) {
        setFaceStatus('no_face');
        animFrameRef.current = requestAnimationFrame(() => runDetectionRef.current?.());
        return;
      }

      checkViolation('face_multiple', faces.length > 1, { count: faces.length });

      const landmarks = faces[0];
      const categories = blendshapes[0]?.categories ?? [];

      const { yaw, pitch } = getHeadPose(landmarks);
      const lookingAway = Math.abs(yaw) > 35;
      const lookingDown = pitch > 30;
      checkViolation('face_looking_away', lookingAway, { yaw: +yaw.toFixed(1) });
      checkViolation('face_looking_down', lookingDown, { pitch: +pitch.toFixed(1) });

      const leftBlink = categories.find((s) => s.categoryName === 'eyeBlinkLeft')?.score ?? 0;
      const rightBlink = categories.find((s) => s.categoryName === 'eyeBlinkRight')?.score ?? 0;
      const eyesClosed = leftBlink > 0.88 && rightBlink > 0.88;
      checkViolation('face_eyes_closed', eyesClosed);

      const xs = landmarks.map((p) => p.x);
      const ys = landmarks.map((p) => p.y);
      const faceArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      checkViolation('face_too_far', faceArea < 0.025);

      if (faces.length > 1) setFaceStatus('multiple');
      else if (lookingAway) setFaceStatus('looking_away');
      else if (lookingDown) setFaceStatus('looking_down');
      else if (eyesClosed) setFaceStatus('eyes_closed');
      else if (faceArea < 0.04) setFaceStatus('too_far');
      else setFaceStatus('ok');
    } catch {
      /* per-frame errors are silent */
    }

    animFrameRef.current = requestAnimationFrame(() => runDetectionRef.current?.());
  };

  useEffect(() => {
    if (!enabled || !sessionId) return;
    let cancelled = false;

    async function init() {
      // Graceful degradation: if MediaPipe is not installed, no-op.
      const mp = await loadMediaPipe();
      if (cancelled) return;
      if (!mp) {
        setUnavailable(true);
        setFaceStatus('unavailable');
        return;
      }

      try {
        const FaceLandmarker = mp.FaceLandmarker as {
          createFromOptions: (vision: unknown, opts: unknown) => Promise<typeof landmarkerRef.current>;
        };
        const FilesetResolver = mp.FilesetResolver as {
          forVisionTasks: (wasm: string) => Promise<unknown>;
        };

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm',
        );

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 3,
        });

        if (cancelled) {
          landmarker?.close();
          return;
        }
        landmarkerRef.current = landmarker;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          landmarker?.close();
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setIsReady(true);
        setFaceStatus('ok');
        animFrameRef.current = requestAnimationFrame(() => runDetectionRef.current?.());
      } catch (err: unknown) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        const isDenied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
        setCameraError(
          isDenied
            ? 'Camera permission denied. Please allow camera access to take this quiz.'
            : 'Failed to initialise face detection.',
        );
        setFaceStatus('camera_error');
        sendEvent.current('face_camera_error', { reason: name, message: (err as { message?: string })?.message });
      }
    }

    void init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current = null;
      setIsReady(false);
      setFaceStatus('initializing');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId]);

  return { videoRef, isReady, unavailable, cameraError, faceStatus };
}
