import * as React from "react";
import type { EffectiveStatus } from "@/lib/presence-store";

/**
 * Presence status badge: a color-coded circle + a distinguishing glyph, so the
 * six statuses are separable by BOTH hue and shape (accessibility — two reds at
 * 8px are otherwise indistinguishable, esp. for color-vision deficiency).
 *
 * Size-aware, legible-or-degrade: at large sizes (picker rows, ~16px) it draws
 * the full glyph (check / dash / clock / phone / hollow ring). At tiny corner-dot
 * sizes it degrades to the shape-critical distinctions only — the DND dash (so
 * busy vs dnd, both red, never collide) and the offline/appear_offline hollow
 * ring — and relies on color alone for the rest (a muddy 8px clock/check helps
 * no one). Semantic colors are fixed across the 7 accent themes.
 */

/** Below this px size, fine glyphs (check/clock/phone) are dropped; see above. */
const GLYPH_SIZE_THRESHOLD = 14;

export interface PresenceIndicatorProps {
  status: EffectiveStatus;
  /** Rendered px size (also the SVG width/height). */
  size?: number;
  className?: string;
}

/** Glyph color layered over the status circle. */
const GLYPH = "#ffffff";
// CSS custom properties only resolve through `style`, NOT via SVG presentation
// attributes (`stroke="var(--x)"` would be ignored) — so the surface ring/hole
// are set inline here. `currentColor` is a real keyword and works as an attribute.
const SURFACE = "var(--qc-surface)";

export function PresenceIndicator({ status, size = 16, className }: PresenceIndicatorProps) {
  const large = size >= GLYPH_SIZE_THRESHOLD;
  const hollow = status === "offline" || status === "appear_offline";

  return (
    <svg
      className={`qc-presence-svg qc-presence--${status}${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="presentation"
      aria-hidden
    >
      {hollow ? (
        // Hollow ring (donut) — distinct SHAPE at every size, not just color.
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" strokeWidth="1.5" style={{ stroke: SURFACE }} />
          <circle cx="8" cy="8" r="3.1" style={{ fill: SURFACE }} />
        </>
      ) : (
        <circle cx="8" cy="8" r="7" fill="currentColor" strokeWidth="1.5" style={{ stroke: SURFACE }} />
      )}

      {/* DND dash — kept at ALL sizes: the only shape that separates dnd from busy (both red). */}
      {status === "dnd" ? (
        <line x1="4.6" y1="8" x2="11.4" y2="8" stroke={GLYPH} strokeWidth="1.8" strokeLinecap="round" />
      ) : null}

      {/* Fine glyphs only when large enough to read. */}
      {large && (status === "available" || status === "online") ? (
        <polyline
          points="4.6,8.2 7,10.4 11.4,5.4"
          fill="none"
          stroke={GLYPH}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {large && (status === "away" || status === "brb") ? (
        // Minimal clock: outline + hour/minute hands.
        <>
          <circle cx="8" cy="8" r="3.4" fill="none" stroke={GLYPH} strokeWidth="1.1" />
          <line x1="8" y1="8" x2="8" y2="5.6" stroke={GLYPH} strokeWidth="1.1" strokeLinecap="round" />
          <line x1="8" y1="8" x2="9.8" y2="8.8" stroke={GLYPH} strokeWidth="1.1" strokeLinecap="round" />
        </>
      ) : null}

      {large && status === "on_call" ? (
        // Simple phone handset.
        <path
          d="M6.1 5.1c-.4-.1-.8.1-.9.5-.3 1 .0 2.2.8 3.3.8 1.1 1.9 1.8 3 1.9.4 0 .7-.2.8-.6l.2-.9c.0-.3-.1-.6-.4-.7l-1-.4c-.3-.1-.6 0-.8.2l-.3.3c-.6-.3-1.1-.8-1.4-1.4l.3-.3c.2-.2.3-.5.2-.8l-.4-1c-.1-.2-.3-.4-.5-.4z"
          fill={GLYPH}
        />
      ) : null}
    </svg>
  );
}
