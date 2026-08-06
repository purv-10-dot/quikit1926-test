/**
 * Calling audio: the incoming ringtone, the caller's ringback, and the short
 * connected/ended tones. Sibling of `notification-sound.ts` and built the same
 * way — synthesized WebAudio (no binary assets, no request on the call path),
 * one shared AudioContext, every entry point guarded so audio can never throw
 * into call logic.
 *
 * The difference from the notification chime is LIFETIME: ringtone and ringback
 * loop until something stops them. Each start returns a stop handle that clears
 * the repeat timer AND stops every oscillator it created, so nothing can outlive
 * a call. Callers must invoke it on every terminal path and on unmount.
 *
 * Gating (callSoundsEnabled, DND) lives at the call sites — this module only
 * knows how to make noise.
 */

/** A running loop. Idempotent: calling stop twice is safe. */
export type StopSound = () => void;

/** One note in a pattern: frequency, offset from pattern start, duration (s). */
interface Note {
  freq: number;
  at: number;
  dur: number;
}

interface Pattern {
  notes: Note[];
  /** Seconds from one pattern start to the next (loop period). */
  period: number;
  gain: number;
}

// Distinct, recognisable shapes per sound.
const RINGTONE: Pattern = {
  // Two-tone warble, twice, then a rest — the classic "incoming call".
  notes: [
    { freq: 660, at: 0, dur: 0.4 },
    { freq: 550, at: 0.4, dur: 0.4 },
    { freq: 660, at: 0.9, dur: 0.4 },
    { freq: 550, at: 1.3, dur: 0.4 },
  ],
  period: 3,
  gain: 0.1,
};

const RINGBACK: Pattern = {
  // Single low tone with a long gap — what the CALLER hears while waiting.
  notes: [{ freq: 440, at: 0, dur: 1 }],
  period: 4,
  gain: 0.07,
};

const CONNECTED: Pattern = {
  notes: [
    { freq: 620, at: 0, dur: 0.09 },
    { freq: 880, at: 0.09, dur: 0.14 },
  ],
  period: 0,
  gain: 0.09,
};

const ENDED: Pattern = {
  notes: [
    { freq: 520, at: 0, dur: 0.12 },
    { freq: 390, at: 0.12, dur: 0.18 },
  ],
  period: 0,
  gain: 0.09,
};

/** Lead time for the next scheduled repeat, so the loop never audibly gaps. */
const SCHEDULE_AHEAD_MS = 120;

let ctx: AudioContext | null = null;

/** Is WebAudio usable here? False on the server and in jsdom. */
export function callSoundsSupported(): boolean {
  return typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
}

function getContext(): AudioContext | null {
  if (!callSoundsSupported()) return null;
  if (!ctx) ctx = new window.AudioContext();
  return ctx;
}

/**
 * Schedule one pass of a pattern. Returns the oscillators it started so the
 * owning loop can stop them early if the call ends mid-pattern.
 */
function schedulePattern(audio: AudioContext, pattern: Pattern, startAt: number): Oscillators {
  const started: OscillatorNode[] = [];
  for (const note of pattern.notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = note.freq;
    const from = startAt + note.at;
    const to = from + note.dur;
    // Ramped envelope — a raw start/stop on a sine clicks audibly.
    gain.gain.setValueAtTime(0, from);
    gain.gain.linearRampToValueAtTime(pattern.gain, from + 0.02);
    gain.gain.setValueAtTime(pattern.gain, to - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, to);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(from);
    osc.stop(to);
    started.push(osc);
  }
  return started;
}

type Oscillators = OscillatorNode[];

function stopAll(oscillators: Oscillators): void {
  for (const osc of oscillators) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      // Already stopped/disconnected by its scheduled end — fine.
    }
  }
}

/** No-op stop, returned whenever we couldn't start anything. */
const NOOP: StopSound = () => {};

/**
 * Start a looping pattern. The returned stop is the ONLY way it ends — call it
 * on every terminal path and on unmount.
 */
function startLoop(pattern: Pattern): StopSound {
  try {
    const audio = getContext();
    if (!audio) return NOOP;
    if (audio.state === "suspended") void audio.resume().catch(() => {});

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Every oscillator currently scheduled, so an early stop silences the pass
    // already in flight — not just future ones.
    let live: Oscillators = [];

    const tick = () => {
      if (stopped) return;
      try {
        live = schedulePattern(audio, pattern, audio.currentTime);
      } catch {
        // A failed pass shouldn't kill the loop or the call.
      }
      timer = setTimeout(tick, pattern.period * 1000 - SCHEDULE_AHEAD_MS);
    };
    tick();

    return () => {
      if (stopped) return; // idempotent
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      stopAll(live);
      live = [];
    };
  } catch {
    return NOOP;
  }
}

/** Play a pattern once. Best-effort; never throws. */
function playOnce(pattern: Pattern): void {
  try {
    const audio = getContext();
    if (!audio) return;
    if (audio.state === "suspended") void audio.resume().catch(() => {});
    schedulePattern(audio, pattern, audio.currentTime);
  } catch {
    // Silence beats a thrown error on the call path.
  }
}

/** Looping incoming-call ringtone. Gate on callSoundsEnabled AND not DND/snooze. */
export function startRingtone(): StopSound {
  return startLoop(RINGTONE);
}

/** Looping outgoing ringback for the caller. Gate on callSoundsEnabled only. */
export function startRingback(): StopSound {
  return startLoop(RINGBACK);
}

/** One-shot rising blip when the call connects. */
export function playConnectedTone(): void {
  playOnce(CONNECTED);
}

/** One-shot falling blip when the call ends. */
export function playEndedTone(): void {
  playOnce(ENDED);
}

/** Test seam: drop the cached context so the next start builds a fresh one. */
export function __resetCallSoundsForTest(): void {
  ctx = null;
}
