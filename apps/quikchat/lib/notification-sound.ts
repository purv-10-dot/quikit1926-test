/**
 * The notification chime. Sibling of `web-notifications.ts`: the SERVER already
 * decided whether an audible alert is warranted (the `sound` flag accounts for
 * mute / snooze / DND / soundEnabled), so this module only handles the parts the
 * server can't know — is audio available, and will the browser let us play.
 *
 * The tone is SYNTHESIZED rather than loaded from a file: no binary asset in the
 * repo, no request on the notification path, and it works offline. Swapping in a
 * real chime later means replacing `playNotificationSound`'s body with an
 * `Audio(src).play()` — the call site doesn't move.
 */

/** Two-note rising chime — short and quiet enough not to be startling. */
const NOTES: ReadonlyArray<{ freq: number; at: number; for: number }> = [
  { freq: 660, at: 0, for: 0.09 }, // E5
  { freq: 880, at: 0.08, for: 0.13 }, // A5
];
const PEAK_GAIN = 0.09; // ~-21dBFS

/**
 * One AudioContext for the tab's lifetime. Browsers cap how many can exist, and
 * a per-alert context leaks handles under a burst of notifications.
 */
let ctx: AudioContext | null = null;

/** Is WebAudio usable here? False on the server and in jsdom. */
export function notificationSoundSupported(): boolean {
  return typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
}

function getContext(): AudioContext | null {
  if (!notificationSoundSupported()) return null;
  if (!ctx) ctx = new window.AudioContext();
  return ctx;
}

/**
 * Play the chime. Best-effort and never throws: an unsupported browser, a
 * suspended context, or an autoplay-policy rejection all just mean silence — a
 * missing sound must never break the notification pipeline that calls this.
 */
export function playNotificationSound(): void {
  try {
    const audio = getContext();
    if (!audio) return;
    // Autoplay policy: a context created before the first user gesture starts
    // suspended. resume() is a no-op once running, and rejects (rather than
    // throws) while still gesture-blocked — swallow that.
    if (audio.state === "suspended") void audio.resume().catch(() => {});

    const start = audio.currentTime;
    for (const note of NOTES) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = note.freq;
      // Ramped envelope — a raw start/stop on a sine clicks audibly.
      const from = start + note.at;
      const to = from + note.for;
      gain.gain.setValueAtTime(0, from);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, from + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, to);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(from);
      osc.stop(to);
    }
  } catch {
    // Silence beats a thrown error on the notification path.
  }
}

/** Test seam: drop the cached context so the next play builds a fresh one. */
export function __resetNotificationSoundForTest(): void {
  ctx = null;
}
