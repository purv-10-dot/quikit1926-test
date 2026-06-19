/**
 * Deterministic avatar color picker — same userId always lands the same
 * colour. Eight handpicked Tailwind 500-level palettes for the circular
 * initials avatars in member tables.
 */
const PALETTE = [
  "bg-purple-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-rose-500",
  "bg-teal-500",
] as const;

export function avatarColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % PALETTE.length;
  return PALETTE[idx];
}
