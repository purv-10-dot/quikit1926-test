/**
 * Waveform bar heights + scrub math for the voice-note player.
 *
 * Pure and dependency-free so it unit-tests without jsdom, and so the player
 * component stays about playback.
 */

/** Bars drawn per voice note. Fixed so every bubble is the same visual density. */
export const VOICE_WAVE_BARS = 40;

/** Shortest bar, as a fraction of track height — a silent stretch still reads as a bar. */
export const PEAK_MIN = 0.15;

/** FNV-1a over the seed string → a 32-bit integer to key the PRNG with. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, well-distributed, and fully determined by its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ⚠️ PLACEHOLDER SHAPE — these are NOT real amplitudes.
 *
 * A deterministic, seeded bar array so a voice note looks like a voice note. The
 * seed is the media object's storage key, so the same note renders identical bars
 * across reloads, across users, and after a forward (waveform identity belongs to
 * the audio, not the message row).
 *
 * Upgrade path: measure real peaks at record time (an AnalyserNode over the
 * recording stream), persist them on the media message as `peaks`, and pass that
 * array to `VoiceNotePlayer` — it prefers `peaks` and this function stops being
 * used. Deliberately not computed here from the audio: decoding the stored object
 * would require fetching it, and the signed cross-origin GCS URL would need
 * bucket CORS that the server-side storage design exists to avoid.
 */
export function pseudoPeaks(seed: string, count: number = VOICE_WAVE_BARS): number[] {
  const rand = mulberry32(hashSeed(seed));
  // Dominant term: three sinusoids at seeded frequency / phase / amplitude. This
  // is the ONLY part that depends on `i`, and therefore the only reason
  // neighbouring bars move together rather than being independent draws. `amp`
  // is floored so all three can't collapse to near-silence on an unlucky seed.
  const waves = Array.from({ length: 3 }, () => ({
    freq: 0.6 + rand() * 2.4, // cycles across the full bar width
    phase: rand() * Math.PI * 2,
    amp: 0.35 + rand() * 0.65,
  }));

  const raw: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    let weighted = 0;
    let ampSum = 0;
    for (const wave of waves) {
      // `0.5 + 0.5 * sin(...)` maps each wave into 0..1. Raw `sin()` would let the
      // weighted mean go NEGATIVE, making `v / max` negative below, which lands
      // the result UNDER PEAK_MIN — silently breaking the floor that the
      // normalization step is supposed to guarantee. Keep the 0..1 mapping.
      weighted += wave.amp * (0.5 + 0.5 * Math.sin(2 * Math.PI * wave.freq * t + wave.phase));
      ampSum += wave.amp;
    }
    const envelope = ampSum > 0 ? weighted / ampSum : 0.5; // 0..1
    // Fine detail rides on the envelope; it stays the minority term so it can't
    // wash the correlation back out into white noise.
    raw.push(envelope * 0.75 + rand() * 0.25);
  }

  // 3-tap moving average (edges clamp to self) so the per-bar detail term can't
  // reintroduce single-bar spikes between otherwise correlated neighbours.
  const smoothed = raw.map(
    (_, i) => ((raw[i - 1] ?? raw[i]!) + raw[i]! + (raw[i + 1] ?? raw[i]!)) / 3,
  );

  const max = Math.max(...smoothed);
  // Normalize so the loudest bar is exactly 1, then lift the floor to PEAK_MIN.
  return smoothed.map((v) => PEAK_MIN + (max > 0 ? v / max : 1) * (1 - PEAK_MIN));
}

/** Clamp helper shared by both mappings. */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Scrub fraction (0–1) → seconds. 0 when the duration isn't usable. */
export function fractionToTime(fraction: number, durationSec: number | undefined): number {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return clamp01(fraction) * durationSec;
}

/** Seconds → scrub fraction (0–1). 0 when the duration isn't usable. */
export function timeToFraction(currentTime: number, durationSec: number | undefined): number {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return clamp01(currentTime / durationSec);
}
