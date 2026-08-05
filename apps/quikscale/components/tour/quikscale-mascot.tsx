"use client";

/**
 * Scout — QuikScale's onboarding-tour assistant.
 *
 * Renders `/scout-mascot.png` with a floating bob. Mirrors QuikTrack's
 * `KanMascot` API (size/mode/flip/className) so the tour controller's usage
 * reads the same across apps.
 *
 * ── Why this crops instead of just `object-contain` ──
 * The source art is a 1536×1024 landscape canvas but the character only
 * occupies x 471–1179, y 156–823 (709×668) — 13.8% of the pixels; the rest is
 * transparent padding. Fitting that into a square box with `object-contain`
 * scaled to the CANVAS, so the character came out at ~46% of the box (59px
 * inside a 128px frame) and read as a tiny figure floating in dead space.
 *
 * So we treat the wrapper as a crop window onto the character's bounding box:
 * the image is scaled up and offset so `CONTENT` exactly fills `size`. Net
 * effect — `size` now means "how big Scout appears", which is what every
 * caller assumes.
 *
 * If the artwork is ever re-exported with different framing, remeasure the
 * opaque bounding box and update `CONTENT` — nothing else needs to change.
 *
 * Modes:
 *   "wave"   → gentle bob + slight tilt (used during the tour)
 *   "bounce" → vertical bounce (loader / empty-state fallback)
 *   "static" → no animation
 */

/** Intrinsic pixel size of `/scout-mascot.png`. */
const SRC_W = 1536;
const SRC_H = 1024;
/** Opaque bounding box of the character within that canvas (alpha > 8). */
const CONTENT = { x: 471, y: 156, w: 709, h: 668 };

export function QuikScaleMascot({
  size = 160,
  mode = "wave",
  className = "",
  flip = false,
}: {
  size?: number;
  mode?: "wave" | "bounce" | "static";
  className?: string;
  /** Horizontally mirror the character — use when the mascot sits on the
   *  right side of a speech bubble so it still points toward the card. */
  flip?: boolean;
}) {
  const wrapAnim =
    mode === "bounce"
      ? "qs-mascot-bounce"
      : mode === "wave"
        ? "qs-mascot-bob"
        : "";

  // Scale so the character's bounding box fills the square, then offset the
  // oversized image so that box lands in the window. Vertically centred
  // because CONTENT is slightly wider than tall.
  const scale = size / CONTENT.w;
  const imgW = SRC_W * scale;
  const imgH = SRC_H * scale;
  const left = -CONTENT.x * scale;
  const top = -CONTENT.y * scale + (size - CONTENT.h * scale) / 2;

  /*
   * Three nested elements, each owning exactly one job:
   *
   *   outer  → size + the bob/bounce ANIMATION
   *   inner  → the crop window + the FLIP
   *   img    → the oversized, offset artwork
   *
   * The split is load-bearing. `qs-mascot-bob` animates `transform`, and a
   * running CSS animation overrides an inline `transform` on the SAME element —
   * so putting the flip on the animated wrapper silently dropped it and Scout
   * pointed the wrong way. Flipping the image itself is equally wrong: it
   * pivots about the image's own centre and slides the character out of the
   * crop window. Hence a dedicated middle element.
   */
  return (
    <div
      className={`relative ${className} ${wrapAnim}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div
        className="relative h-full w-full"
        style={{
          overflow: "hidden",
          transform: flip ? "scaleX(-1)" : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/scout-mascot.png"
          alt=""
          draggable={false}
          className="absolute select-none"
          style={{
            width: imgW,
            height: imgH,
            left,
            top,
            maxWidth: "none",
            // The art carries its own soft bloom, so it already separates from
            // the tour's navy scrim — no halo needed (an added one read as a
            // grey disc behind him). Just a light grounding shadow.
            filter: "drop-shadow(0 6px 14px rgba(15, 38, 71, 0.30))",
          }}
        />
      </div>
    </div>
  );
}
