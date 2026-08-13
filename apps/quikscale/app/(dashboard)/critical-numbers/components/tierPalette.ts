import type { CriticalTier } from "@/lib/utils/criticalNumberTiers";

/**
 * Tier colours for Critical Numbers.
 *
 * These are SEMANTIC data-state colours, so per CLAUDE.md's accent-colour rules
 * they stay hardcoded rather than becoming `accent-*` — a tenant with a purple
 * theme still needs "Below" to read as trouble.
 *
 * ── Why these are NOT KPI's hexes ─────────────────────────────────────────
 * This palette used to mirror KPI's blue-600 / green-600 / yellow-500 / red-600
 * exactly. That set measurably fails three of the dataviz checks on a white
 * surface:
 *   - yellow-500 sits at OKLCH L 0.795, outside the 0.43–0.77 legibility band;
 *   - red-600 vs green-600 separate by only ΔE 5.0 under deuteranopia (the
 *     floor is 6, the target 8) — the two states that matter most were the
 *     hardest pair for a red-green colourblind reader to tell apart;
 *   - yellow-500 contrasts 1.92:1 against white, under the 3:1 minimum.
 *
 * ── These hexes are STAKEHOLDER-CHOSEN, not derived ───────────────────────
 * Two earlier attempts were rejected on looks: an earth-tone set
 * (indigo/sage/ochre/brick) read muddy, a desaturated set read dull. This one
 * was supplied directly and is the approved look.
 *
 * It also happens to be the best-performing set tried on the check that matters
 * most here. `good` is a TEAL green (#2FA084), not a grass green, and that
 * single choice fixes the red-green problem every other candidate hit: `bad` vs
 * `good` separate by ΔE 8.9 under deuteranopia, clear of the floor of 6 — where
 * the original blue/green/yellow/red measured 5.0 and a warm forest-green ramp
 * measured as low as 1.5. Don't "correct" the green toward a conventional grass
 * green; that regression is invisible to normal vision.
 *
 * KNOWN, ACCEPTED TRADE — do not "fix" silently:
 *   `concerned` #FFC349 is a light amber: OKLCH L 0.851 (outside the 0.43–0.77
 *   band) and 1.60:1 against white. It is the only remaining sub-3:1 value —
 *   `good` clears it at 3.24:1. Chosen for its look; its saturation carries the
 *   visibility that its luminance doesn't.
 *
 *   The mitigation must stay: NO surface here encodes tier by colour alone. The
 *   card, table, chart legend and activity feed all print the tier LABEL
 *   ("Over Achieved" / "Achieved" / "Near" / "Below") beside the colour. If you
 *   ever render a tier as a bare colour — a dot with no text, a heat cell — that
 *   surface needs its own label or texture.
 *
 * Chip text/background pairs all clear WCAG AA (5.9–7.0:1).
 *
 * Before changing any hex, re-run the dataviz `validate_palette.js` all-pairs
 * check so the trade stays a decision rather than an accident.
 *
 * KPI / Priority / WWW keep the original bright set: their tables are
 * CLAUDE.md-locked and must not be re-themed. So the two modules intentionally
 * no longer share one palette.
 */
export const TIER_HEX: Record<CriticalTier, string> = {
  great: "#2196F3", // blue — exceeded
  good: "#2FA084", // teal green — achieved
  concerned: "#FFC349", // warm amber — near
  bad: "#E63946", // red — below
};

/**
 * Tailwind classes for the same four states — text / soft background / border.
 * Arbitrary values because these hexes are outside Tailwind's stock palette.
 * Every text-on-background pair clears WCAG AA for normal text (4.5:1):
 * exceeded 7.59, achieved 5.95, near 5.21, below 8.13.
 */
export const TIER_CLASSES: Record<CriticalTier, { text: string; bg: string; border: string }> = {
  great: { text: "text-[#0B5FA5]", bg: "bg-[#EAF5FE]", border: "border-[#C9E5FB]" },
  good: { text: "text-[#14675A]", bg: "bg-[#EAF6F3]", border: "border-[#C6E7DF]" },
  concerned: { text: "text-[#7A5300]", bg: "bg-[#FFF7E6]", border: "border-[#FBE4B8]" },
  bad: { text: "text-[#A11621]", bg: "bg-[#FDEDEE]", border: "border-[#F8D2D5]" },
};

/** Neutral styling for "no tier yet" — unconfigured, no data, or not started. */
export const TIER_UNKNOWN = {
  hex: "#d1d5db", // gray-300
  text: "text-gray-500",
  bg: "bg-gray-50",
  border: "border-gray-200",
};
