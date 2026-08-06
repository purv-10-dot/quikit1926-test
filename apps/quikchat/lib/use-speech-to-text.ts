"use client";

/**
 * Voice typing (dictation) via the Web Speech API.
 *
 * Deliberately NOT built on `use-voice-recorder.ts`: `SpeechRecognition` opens
 * and owns its own microphone capture internally, so there is no
 * `getUserMedia`/`MediaRecorder` here and no stream to hand around. This hook
 * mirrors that file's SHAPE (state machine, `supported` probe, error-message
 * mapper, ref-based idempotent teardown) so both read the same way, and shares
 * none of its machinery.
 *
 * Outcome differs too: the recorder produces a Blob that becomes an attachment;
 * this produces TEXT that the caller inserts into the editor. Nothing here
 * touches the document — the Composer owns all editor mutation.
 *
 * The hard invariant, same as the recorder's: **the recognition session is
 * released on every exit path** — manual stop, error, `onend`, and unmount.
 * All of them funnel through one idempotent `teardown()` that reads the session
 * out of a ref, never state.
 *
 * ⚠️ PRIVACY: in Chromium this streams captured audio to Google's speech
 * servers (Safari: Apple's). That audio is message content leaving the tenant
 * boundary, and no data-processing agreement covers it. The UI must say so at
 * the point of use; a consent gate and an org-level kill switch are still owed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechToTextState = "idle" | "listening" | "error";

/**
 * The two locales offered. `SpeechRecognition` takes ONE locale per session —
 * there is no mixed/code-switching mode, so this is a genuine either/or, not a
 * limitation of how we call it.
 */
export type SpeechLang = "en-IN" | "hi-IN";

export const SPEECH_LANGS: readonly SpeechLang[] = ["en-IN", "hi-IN"];

/** Short label for the toggle — shows which locale is armed. */
export const SPEECH_LANG_LABEL: Record<SpeechLang, string> = {
  "en-IN": "EN",
  "hi-IN": "हि",
};

/** Full name, for the button's accessible label and tooltip. */
export const SPEECH_LANG_NAME: Record<SpeechLang, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi",
};

export function isSpeechLang(value: unknown): value is SpeechLang {
  return typeof value === "string" && (SPEECH_LANGS as readonly string[]).includes(value);
}

// ============================================================================
// Persistence (localStorage — per machine, never server-synced)
// ============================================================================

/**
 * Mirrors `media-devices.ts`'s `DEVICE_STORAGE_KEY` pattern: a dictation locale
 * is a property of where you're sitting (which mic, which room, who's nearby),
 * not of your account, so syncing it across devices would be wrong.
 */
export const SPEECH_LANG_STORAGE_KEY = "qc.speechLang.v1";

export const DEFAULT_SPEECH_LANG: SpeechLang = "en-IN";

/** Last used locale. Falls back to `en-IN` on SSR, blocked storage, or junk. */
export function getSpeechLang(): SpeechLang {
  if (typeof window === "undefined") return DEFAULT_SPEECH_LANG;
  try {
    const raw = window.localStorage.getItem(SPEECH_LANG_STORAGE_KEY);
    return isSpeechLang(raw) ? raw : DEFAULT_SPEECH_LANG;
  } catch {
    return DEFAULT_SPEECH_LANG;
  }
}

export function setSpeechLang(lang: SpeechLang): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPEECH_LANG_STORAGE_KEY, lang);
  } catch {
    // Storage blocked/full — the choice stays in-memory for this session.
  }
}

// ============================================================================
// Capability probe
// ============================================================================

/** The constructor under either name, or undefined. */
function recognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/**
 * SSR- and capability-safe probe. False during SSR and on Firefox/Opera, which
 * expose neither constructor — the Composer hides the button entirely rather
 * than offering a control that can only fail.
 */
export function isSpeechToTextSupported(): boolean {
  return !!recognitionCtor();
}

/**
 * Human-readable reason recognition failed.
 *
 * Same spirit as `use-voice-recorder.ts`'s `micErrorMessage` but a different
 * vocabulary: that one branches on `getUserMedia`'s DOMException *names*, this
 * one on `SpeechRecognitionErrorEvent.error` codes. Kept separate on purpose —
 * the wording is about dictation, and the code sets don't overlap.
 */
export function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow it in your browser settings to use voice typing.";
    case "no-speech":
      return "Didn't catch anything — try speaking a little closer to the mic.";
    case "audio-capture":
      return "No microphone found.";
    case "network":
      return "Voice typing needs a network connection and couldn't reach the speech service.";
    case "language-not-supported":
      return "This browser doesn't support voice typing in the selected language.";
    default:
      return "Voice typing stopped unexpectedly.";
  }
}

export interface UseSpeechToTextOptions {
  /**
   * Called for each recognition update. `isFinal` marks the segment as
   * committed — the caller replaces its live span and stops tracking it.
   */
  onResult?: (text: string, isFinal: boolean) => void;
}

export interface UseSpeechToText {
  state: SpeechToTextState;
  /** Latest not-yet-final transcript ("" when nothing is pending). */
  interimText: string;
  /** Set alongside `state: "error"`. */
  error?: string;
  /** False during SSR / on Firefox & Opera — hide the button. */
  supported: boolean;
  start: (lang: SpeechLang) => void;
  /** Graceful stop: a pending final result still arrives before `onend`. */
  stop: () => void;
  /**
   * Hard stop: discards anything still in flight and releases now. Used when the
   * message is being sent — a final result landing after the editor was cleared
   * would drop stray words into an empty composer.
   */
  cancel: () => void;
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToText {
  const [state, setState] = useState<SpeechToTextState>("idle");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [supported, setSupported] = useState(false);

  const sessionRef = useRef<SpeechRecognition | null>(null);
  // Read inside recognition callbacks that outlive a render.
  const stateRef = useRef<SpeechToTextState>("idle");
  const mountedRef = useRef(true);
  const onResultRef = useRef(options.onResult);
  onResultRef.current = options.onResult;

  // Probe after mount so SSR renders `supported: false` and hydration matches.
  useEffect(() => {
    setSupported(isSpeechToTextSupported());
  }, []);

  function setSpeechState(next: SpeechToTextState) {
    stateRef.current = next;
    setState(next);
  }

  /**
   * Release the session. Idempotent, ref-based, safe from an unmount cleanup:
   * detaches the handlers FIRST (so a late `onresult`/`onend` can't write into
   * discarded state) and then `abort()`s.
   *
   * `abort()` not `stop()`: stop() politely waits to deliver one more final
   * result, which is precisely wrong when the component is going away or has
   * already errored. The graceful path lives in `stop()` below.
   */
  const teardown = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    session.onresult = null;
    session.onerror = null;
    session.onend = null;
    session.onstart = null;
    try {
      session.abort();
    } catch {
      // Already dead / detached — nothing left to release.
    }
  }, []);

  const start = useCallback(
    (lang: SpeechLang) => {
      if (stateRef.current === "listening") return;
      const Ctor = recognitionCtor();
      if (!Ctor) {
        setError("Voice typing isn't supported in this browser.");
        setSpeechState("error");
        return;
      }
      // Never stack sessions: a previous one lingering would double-capture.
      teardown();
      setError(undefined);
      setInterimText("");

      let session: SpeechRecognition;
      try {
        session = new Ctor();
      } catch {
        setError("Voice typing isn't supported in this browser.");
        setSpeechState("error");
        return;
      }
      session.lang = lang;
      // Keep listening across pauses so a sentence isn't cut at the first
      // silence; interim results are what drive the live span in the editor.
      session.continuous = true;
      session.interimResults = true;
      session.maxAlternatives = 1;

      session.onresult = (event: SpeechRecognitionEvent) => {
        if (!mountedRef.current) return;
        // `resultIndex` is where THIS event's changes begin — starting at 0
        // would re-emit already-committed segments as if they were new.
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;
          const text = result[0]?.transcript ?? "";
          if (!text) continue;
          if (result.isFinal) {
            // Commit: the caller replaces its live span and stops tracking it.
            onResultRef.current?.(text, true);
          } else {
            interim += text;
          }
        }
        setInterimText(interim);
        if (interim) onResultRef.current?.(interim, false);
      };

      session.onerror = (event: SpeechRecognitionErrorEvent) => {
        // A stop()/abort() we initiated reports "aborted" — not a user-facing
        // failure, and `onend` already returns us to idle.
        if (event.error === "aborted") return;
        teardown();
        if (!mountedRef.current) return;
        setInterimText("");
        setError(speechErrorMessage(event.error));
        setSpeechState("error");
      };

      session.onend = () => {
        // Fires for every end — user stop, silence timeout, or vendor cutoff.
        // Release here too so an auto-ended session is never left attached.
        const errored = stateRef.current === "error";
        teardown();
        if (!mountedRef.current) return;
        setInterimText("");
        if (!errored) setSpeechState("idle");
      };

      sessionRef.current = session;
      try {
        session.start();
      } catch {
        teardown();
        setError("Couldn't start voice typing.");
        setSpeechState("error");
        return;
      }
      setSpeechState("listening");
    },
    [teardown],
  );

  /**
   * Graceful stop — `stop()` lets a pending final result land first, so the
   * user's last words still commit. `onend` then tears the session down.
   */
  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      setSpeechState("idle");
      setInterimText("");
      return;
    }
    try {
      session.stop();
    } catch {
      // Wouldn't stop cleanly — force the release.
      teardown();
      setSpeechState("idle");
      setInterimText("");
    }
  }, [teardown]);

  /**
   * Hard stop — `teardown()` detaches the handlers before aborting, so a final
   * result already queued by the engine can never be delivered.
   */
  const cancel = useCallback(() => {
    teardown();
    setSpeechState("idle");
    setInterimText("");
    setError(undefined);
  }, [teardown]);

  // Unmount: never leave a recognition session (and its mic) live.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [teardown]);

  return { state, interimText, error, supported, start, stop, cancel };
}
