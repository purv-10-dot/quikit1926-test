"use client";

/**
 * Voice-note recorder (WhatsApp-style tap-to-start / tap-to-stop).
 *
 * Wraps `MediaRecorder` + `getUserMedia` and hands the caller a finished Blob
 * plus the elapsed seconds it measured. The Composer wraps that Blob in a `File`
 * and stages it as a normal `pending` attachment, so the recording rides the
 * EXISTING sign → PUT → send-Media path (`uploadFile` → `onSendMedia`). There is
 * deliberately no upload/send logic in here.
 *
 * The one hard invariant: **the microphone is released on every exit path** —
 * stop, cancel, recorder error, and unmount. All four funnel through a single
 * idempotent `teardown()` that reads the stream/recorder/timer out of refs (never
 * state), so an unmount mid-recording still stops every track and no lingering
 * OS "recording" indicator is left behind.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getSelectedDevices, isDeviceUnavailableError, micConstraint } from "@/lib/media-devices";

export type VoiceRecorderState = "idle" | "recording" | "error";

export interface VoiceRecording {
  blob: Blob;
  /**
   * Elapsed recording time measured by the hook — the authoritative duration.
   * It's what the live timer showed, and it's what gets persisted on the message
   * (`MediaMeta.durationSec`); the audio container's own metadata is never read.
   */
  durationSec: number;
  /** Base MIME with codec params stripped (e.g. `audio/webm`) — matches `blob.type`. */
  mimeType: string;
}

/** Hard cap — recording auto-stops here (5 minutes). */
export const VOICE_MAX_SEC = 300;

/**
 * Preference order. Chrome/Firefox take the first; Safari's MediaRecorder only
 * does `audio/mp4`, which is why `audio/mp4` had to join the upload allowlist.
 */
const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

/**
 * Strip the codec parameter: Chrome reports `blob.type` as the FULL string it was
 * given (`"audio/webm;codecs=opus"`), but the upload allowlist is an exact-match
 * `includes()` on both the client (`validateFile`) and the server (`/api/uploads/sign`).
 * Uploading the parameterized value would be rejected, so everything downstream
 * of this hook sees the base type only.
 */
export function baseMimeType(mimeType: string | undefined): string {
  return (mimeType ?? "").split(";")[0]!.trim().toLowerCase();
}

/** File extension for a recorded voice note, from its base MIME. */
export function voiceFileExtension(mimeType: string | undefined): string {
  switch (baseMimeType(mimeType)) {
    case "audio/mp4":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
      return "wav";
    default:
      return "webm";
  }
}

/**
 * SSR- and capability-safe probe. False during SSR and on browsers without
 * MediaRecorder / mediaDevices — the Composer hides the mic button entirely
 * rather than offering a control that can only fail.
 */
export function isVoiceRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** First candidate the browser admits, or undefined to take its default. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  // isTypeSupported is optional on the spec'd interface; treat its absence as
  // "can't probe" and fall through to the browser default.
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return CANDIDATE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

/** Human-readable reason a mic grab failed (the caller toasts this). */
function micErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow it in your browser settings to record a voice message.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone found.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your microphone is already in use by another app.";
  }
  return err instanceof Error && err.message ? err.message : "Couldn't start recording.";
}

export interface UseVoiceRecorderOptions {
  /** Override the 300s cap (tests). */
  maxSec?: number;
  /**
   * Fired when the cap auto-stops a recording. The caller MUST stage the result
   * the same way it stages a manual stop — otherwise a 5-minute recording would
   * be silently discarded.
   */
  onAutoStop?: (recording: VoiceRecording) => void;
}

export interface UseVoiceRecorder {
  state: VoiceRecorderState;
  /** Whole seconds since start — drives the live mm:ss timer. */
  elapsedSec: number;
  /** Set alongside `state: "error"` (permission denied, no device, …). */
  error?: string;
  /** False during SSR / on unsupported browsers — hide the mic button. */
  supported: boolean;
  start: () => Promise<void>;
  /** Stop and return the recording; null if nothing was captured. */
  stop: () => Promise<VoiceRecording | null>;
  /** Stop, discard the bytes, release the mic. */
  cancel: () => void;
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}): UseVoiceRecorder {
  const maxSec = options.maxSec ?? VOICE_MAX_SEC;

  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [supported, setSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const chosenMimeRef = useRef<string | undefined>(undefined);
  // Read inside interval/event callbacks that outlive a render.
  const stateRef = useRef<VoiceRecorderState>("idle");
  const mountedRef = useRef(true);
  const maxSecRef = useRef(maxSec);
  maxSecRef.current = maxSec;
  const onAutoStopRef = useRef(options.onAutoStop);
  onAutoStopRef.current = options.onAutoStop;

  // Capability probe runs after mount so SSR renders `supported: false` and the
  // markup matches on hydration.
  useEffect(() => {
    setSupported(isVoiceRecordingSupported());
  }, []);

  function setRecorderState(next: VoiceRecorderState) {
    stateRef.current = next;
    setState(next);
  }

  /** Whole seconds elapsed, measured from the start timestamp (drift-free). */
  const measuredSec = useCallback(() => {
    const startedAt = startedAtRef.current;
    if (startedAt == null) return 0;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }, []);

  /**
   * Release EVERYTHING. Idempotent, ref-based, and safe to call from an unmount
   * cleanup: nulls the handlers first (so a pending `dataavailable` can't push
   * into a discarded buffer), stops the recorder if it's still live, then stops
   * every track — which is what actually turns the mic off.
   */
  const teardown = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Already stopped / detached — the track stop below is what matters.
        }
      }
    }
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Best effort: keep stopping the remaining tracks.
        }
      }
    }
    startedAtRef.current = null;
  }, []);

  /**
   * Shared stop path for both the manual `stop()` and the cap's auto-stop.
   * Resolves on the recorder's `stop` event — `dataavailable` always fires first,
   * so the chunk list is complete by then. Tears down (mic released) either way.
   */
  const finish = useCallback((): Promise<VoiceRecording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      teardown();
      return Promise.resolve(null);
    }
    const durationSec = Math.max(1, Math.min(measuredSec(), maxSecRef.current));
    const mimeType = baseMimeType(recorder.mimeType || chosenMimeRef.current || "audio/webm");
    // Stop the interval now so a tick can't re-enter the cap branch mid-stop.
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return new Promise<VoiceRecording | null>((resolve) => {
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        teardown();
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob.size > 0 ? { blob, durationSec, mimeType } : null);
      };
      try {
        recorder.stop();
      } catch (err) {
        chunksRef.current = [];
        teardown();
        resolve(null);
        void err;
      }
    });
  }, [measuredSec, teardown]);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    if (stateRef.current !== "recording") return null;
    const recording = await finish();
    setRecorderState("idle");
    setElapsedSec(0);
    return recording;
  }, [finish]);

  const cancel = useCallback(() => {
    chunksRef.current = [];
    teardown();
    setRecorderState("idle");
    setElapsedSec(0);
    setError(undefined);
  }, [teardown]);

  const start = useCallback(async (): Promise<void> => {
    if (stateRef.current === "recording") return;
    if (!isVoiceRecordingSupported()) {
      setError("Recording isn't supported in this browser.");
      setRecorderState("error");
      return;
    }
    setError(undefined);

    // Honour the mic chosen in Settings → Devices. A saved id can go stale
    // (headset unplugged, or the browser rotated ids after site data was
    // cleared), so an unavailable-device failure retries ONCE on the system
    // default rather than breaking recording. A denial is never retried — that
    // would re-prompt in a loop — and the saved selection is left intact.
    const micId = getSelectedDevices().micId;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraint(micId) });
    } catch (err) {
      if (!micId || !isDeviceUnavailableError(err)) {
        setRecorderState("error");
        setError(micErrorMessage(err));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (fallbackErr) {
        setRecorderState("error");
        setError(micErrorMessage(fallbackErr));
        return;
      }
    }

    // Unmounted (or cancelled) while the permission prompt was open — release the
    // stream immediately rather than going hot with no UI attached.
    if (!mountedRef.current) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    const mimeType = pickMimeType();
    chosenMimeRef.current = mimeType;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (err) {
      for (const track of stream.getTracks()) track.stop();
      setRecorderState("error");
      setError(micErrorMessage(err));
      return;
    }

    chunksRef.current = [];
    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      chunksRef.current = [];
      teardown();
      setRecorderState("error");
      setError("Recording stopped unexpectedly.");
    };

    try {
      recorder.start();
    } catch (err) {
      teardown();
      setRecorderState("error");
      setError(micErrorMessage(err));
      return;
    }

    startedAtRef.current = Date.now();
    setElapsedSec(0);
    setRecorderState("recording");
    timerRef.current = setInterval(() => {
      const secs = measuredSec();
      setElapsedSec(secs);
      if (secs >= maxSecRef.current) {
        // Cap reached: stop through the same path a tap would, then hand the
        // result to the caller so the recording is staged, not lost.
        void (async () => {
          const recording = await stop();
          if (recording) onAutoStopRef.current?.(recording);
        })();
      }
    }, 1000);
  }, [measuredSec, stop, teardown]);

  // Unmount: the #1 robustness requirement — never leave the mic hot.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      chunksRef.current = [];
      teardown();
    };
  }, [teardown]);

  return { state, elapsedSec, error, supported, start, stop, cancel };
}
