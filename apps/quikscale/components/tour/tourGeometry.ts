/**
 * Pure layout maths for the onboarding tour's Scout + speech-bubble group.
 *
 * Extracted from the tour controller so the three invariants that actually
 * matter can be unit-tested against real anchor shapes instead of eyeballed:
 *
 *   1. the group is fully inside the viewport (nothing clipped off an edge)
 *   2. the group NEVER overlaps the spotlighted target — the whole point of a
 *      spotlight is that the target stays readable
 *   3. Scout is a corner character, not a hero image
 *
 * The bug this replaces: placement and clamping were computed for the BUBBLE
 * only, while Scout was positioned afterwards relative to the bubble and never
 * clamped or accounted for. On a sidebar anchor that put her at x = -58 —
 * simultaneously off-screen and on top of the very nav item being spotlighted.
 * Both symptoms are the same root cause, so the fix is to treat mascot+bubble
 * as ONE box for placement, clamping and overlap-avoidance.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Placement = "right" | "left" | "below" | "above";

/** Space kept between the spotlighted element and the group. */
export const GAP = 16;
/** Never let the group touch the viewport edge. */
export const EDGE_MARGIN = 8;
export const BUBBLE_WIDTH = 340;
/** Pre-measurement guess; corrected once the real bubble has rendered. */
export const DEFAULT_BUBBLE_HEIGHT = 220;
/**
 * Scout's rendered size — and since QuikScaleMascot crops to the character's
 * bounding box, this is genuinely how big HE APPEARS, not the size of a mostly
 * transparent canvas.
 *
 * Calibration: the original 340 was applied to the uncropped 1536×1024 art, so
 * the character actually drew at 340 × 709/1536 ≈ 157px — the size that looked
 * right. 160 reproduces that, while the layout box stays a companion-sized
 * 160 (not the 340 that used to overflow the sidebar and the viewport).
 */
export const MASCOT_SIZE = 160;
/**
 * How far Scout tucks under the bubble's edge, so they read as one group.
 * Kept small: at 20 a noticeable slice of her disappeared behind the card,
 * which (with the placeholder art) made her hard to spot at all.
 */
export const MASCOT_OVERLAP = 8;
/** Extra width Scout adds beyond the bubble once tucked. */
export const MASCOT_FOOTPRINT = MASCOT_SIZE - MASCOT_OVERLAP;

export interface GroupLayout {
  placement: Placement;
  /** Whole mascot+bubble bounding box. */
  group: Rect;
  bubble: { top: number; left: number };
  mascot: { top: number; left: number };
  mascotSide: "left" | "right";
  /** True when no placement could avoid the target (pathological viewport). */
  overlapsAnchor: boolean;
}

const PLACEMENT_ORDER: Placement[] = ["right", "left", "below", "above"];

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

/**
 * Scout stands between the bubble and the anchor for side placements (so she
 * faces what's being pointed at); for below/above there's no facing
 * requirement, so she takes whichever half of the screen has more room.
 */
function mascotSideFor(placement: Placement, groupLeft: number, vw: number): "left" | "right" {
  if (placement === "right") return "left";
  if (placement === "left") return "right";
  return groupLeft + (BUBBLE_WIDTH + MASCOT_FOOTPRINT) / 2 > vw / 2 ? "right" : "left";
}

/** Group box for one candidate placement, clamped to the viewport. */
function groupFor(
  anchor: Rect,
  placement: Placement,
  bubbleH: number,
  vw: number,
  vh: number,
): Rect {
  const width = BUBBLE_WIDTH + MASCOT_FOOTPRINT;
  const height = Math.max(bubbleH, MASCOT_SIZE);

  let left: number;
  let top: number;
  if (placement === "right" || placement === "left") {
    top = anchor.top + anchor.height / 2 - height / 2;
    left = placement === "right" ? anchor.left + anchor.width + GAP : anchor.left - GAP - width;
  } else {
    left = anchor.left + anchor.width / 2 - width / 2;
    top = placement === "below" ? anchor.top + anchor.height + GAP : anchor.top - GAP - height;
  }

  // Clamp the WHOLE group — this is what stopped Scout hanging off x < 0.
  left = clamp(left, EDGE_MARGIN, vw - width - EDGE_MARGIN);
  top = clamp(top, EDGE_MARGIN, vh - height - EDGE_MARGIN);
  return { left, top, width, height };
}

/**
 * Place the mascot+bubble group beside `anchor`.
 *
 * Tries right → left → below → above and takes the first candidate that, AFTER
 * clamping, still clears the anchor. Checking post-clamp matters: a sidebar
 * anchor sits at x≈0, so a "left" placement clamps back to the edge margin and
 * would land on top of the target — pre-clamp checks miss that entirely.
 */
export function computeGroupLayout(
  anchor: Rect,
  bubbleH: number,
  vw: number,
  vh: number,
): GroupLayout {
  let chosen: { placement: Placement; group: Rect } | null = null;
  let fallback: { placement: Placement; group: Rect; overlap: number } | null = null;

  for (const placement of PLACEMENT_ORDER) {
    const group = groupFor(anchor, placement, bubbleH, vw, vh);
    if (!intersects(group, anchor)) {
      chosen = { placement, group };
      break;
    }
    // Keep the least-bad option in case every direction collides (a viewport
    // too small to hold the group beside the target at all).
    const overlapW = Math.max(0, Math.min(group.left + group.width, anchor.left + anchor.width) - Math.max(group.left, anchor.left));
    const overlapH = Math.max(0, Math.min(group.top + group.height, anchor.top + anchor.height) - Math.max(group.top, anchor.top));
    const overlap = overlapW * overlapH;
    if (!fallback || overlap < fallback.overlap) fallback = { placement, group, overlap };
  }

  const picked = chosen ?? { placement: fallback!.placement, group: fallback!.group };
  const { placement, group } = picked;
  const mascotSide = mascotSideFor(placement, group.left, vw);

  const bubbleLeft = mascotSide === "left" ? group.left + MASCOT_FOOTPRINT : group.left;
  const mascotLeft =
    mascotSide === "left" ? group.left : group.left + BUBBLE_WIDTH - MASCOT_OVERLAP;

  return {
    placement,
    group,
    bubble: { top: group.top + (group.height - bubbleH) / 2, left: bubbleLeft },
    mascot: { top: group.top + (group.height - MASCOT_SIZE) / 2, left: mascotLeft },
    mascotSide,
    overlapsAnchor: chosen === null,
  };
}
