/**
 * Density calculator for book-format previews (FACe, PACe, SWT).
 *
 * As content grows past a comfortable threshold, every CSS dimension scales
 * down smoothly. Fonts, paddings, gaps, dot sizes all shrink together so the
 * sheet stays visually balanced at any entry count — and the PDF export then
 * captures an already-adapted DOM, so the exported page looks consistent in
 * density regardless of how many rows are present.
 *
 *   itemCount   | scale
 *   ───────────────────
 *   ≤ 10        | 1.00   (comfortable)
 *   15          | 0.93
 *   20          | 0.85
 *   30          | 0.70
 *   ≥ 35        | 0.65   (floor)
 */

export interface PreviewDensity {
  /** Raw scale factor 0.65 – 1.0 */
  scale: number;
  /** Round a "comfortable" font-size in px to its density-scaled value */
  font: (px: number) => number;
  /** Round a "comfortable" padding/gap/dot in px to its density-scaled value
   *  with a 1 px floor so things never collapse to zero */
  pad:  (px: number) => number;
}

export function computeDensity(itemCount: number, threshold = 10): PreviewDensity {
  const scale = Math.max(
    0.65,
    Math.min(1.0, 1.0 - Math.max(0, itemCount - threshold) * 0.0175),
  );
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    scale,
    font: (px: number) => round(px * scale),
    pad:  (px: number) => Math.max(1, round(px * scale)),
  };
}
