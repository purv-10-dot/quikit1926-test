/**
 * Per-call sound lifecycle, lifted out of the call page.
 *
 * The page knows WHEN things happen (offer sent, answered, ended); this owns
 * WHAT that means for audio — the enabled flag, the ringback's stop handle, and
 * the play-connected-once guard. Keeping it here means the 800-line call page
 * gets five one-line calls instead of three refs and a guard, and the lifecycle
 * is unit-testable without a WebRTC harness.
 *
 * Gating note: ringback is gated on `callSoundsEnabled` ALONE — deliberately not
 * DND-gated, because the caller initiated and wants the ringing cue. The
 * incoming ringtone (CallHandler) is the one that respects DND/snooze.
 *
 * Every method is safe to call at any time, in any order, more than once.
 */

import {
  playConnectedTone,
  playEndedTone,
  startRingback,
  type StopSound,
} from "./call-sounds";

export interface CallSoundController {
  /** Apply the user's `callSoundsEnabled`. Disabling stops anything playing. */
  setEnabled: (enabled: boolean) => void;
  /** Caller only: begin the looping ringback. No-op if disabled or already running. */
  startRingback: () => void;
  /** Remote picked up (or their media arrived): stop ringback, chime ONCE. */
  connected: () => void;
  /** Call finished. */
  ended: () => void;
  /** Terminal cleanup — silences everything. Safe to call repeatedly. */
  stopAll: () => void;
}

export function createCallSoundController(): CallSoundController {
  let enabled = false; // silent until the settings fetch says otherwise
  let stopRingback: StopSound | null = null;
  // The caller hits `connected()` on call:answer and again on the first
  // ontrack; the callee only ever gets the latter. Guard so the caller doesn't
  // hear it twice while the callee still hears it once.
  let connectedPlayed = false;

  const stopRingbackNow = () => {
    stopRingback?.();
    stopRingback = null;
  };

  return {
    setEnabled(next: boolean) {
      enabled = next;
      // Turning sounds off mid-call must silence a ringback already looping.
      if (!next) stopRingbackNow();
    },

    startRingback() {
      if (!enabled || stopRingback) return;
      stopRingback = startRingback();
    },

    connected() {
      // Stop the ringback even when sounds are disabled — `enabled` can flip
      // off mid-call, and a stale handle must never outlive the ringing phase.
      stopRingbackNow();
      if (!enabled || connectedPlayed) return;
      connectedPlayed = true;
      playConnectedTone();
    },

    ended() {
      stopRingbackNow();
      if (!enabled) return;
      playEndedTone();
    },

    stopAll() {
      stopRingbackNow();
    },
  };
}
