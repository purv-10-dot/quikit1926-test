import { describe, it, expect } from "vitest";
import {
  classificationBoxPosition,
  classifyTalent,
  quadrantFromScores,
} from "../../lib/schemas/talentSchema";

// On the chart: X = performance, Y = potential, cut-lines split the 2×2 boxes.
//   A = top-right (perf ≥ cut, pot ≥ cut)   B = top-left  (perf < cut, pot ≥ cut)
//   C = bottom-right (perf ≥ cut, pot < cut) D = bottom-left (perf < cut, pot < cut)
// Placement is driven by the saved classification, so the box always matches
// the badge — A→A box, B→B box, C→C box. The D box is never used.

describe("classificationBoxPosition", () => {
  it("places an A Player in the top-right (A) box", () => {
    const { perf, pot } = classificationBoxPosition("A", "user-a", 50, 50);
    expect(perf).toBeGreaterThanOrEqual(50);
    expect(pot).toBeGreaterThanOrEqual(50);
  });

  it("places a B Player in the top-left (B) box", () => {
    const { perf, pot } = classificationBoxPosition("B", "user-b", 50, 50);
    expect(perf).toBeLessThan(50);
    expect(pot).toBeGreaterThanOrEqual(50);
  });

  // ─── Regression: a saved "C Player" must render in the C box, never D ──────
  it("places a C Player in the bottom-right (C) box — not the D box", () => {
    const { perf, pot } = classificationBoxPosition("C", "user-c", 50, 50);
    expect(perf).toBeGreaterThanOrEqual(50); // right side = C box, NOT left (D)
    expect(pot).toBeLessThan(50);            // bottom half
  });

  it("honours custom benchmark cut-lines", () => {
    const { perf, pot } = classificationBoxPosition("C", "user-c", 70, 30);
    expect(perf).toBeGreaterThanOrEqual(70);
    expect(pot).toBeLessThan(30);
  });

  it("keeps dots inside their box (0.2–0.8 span, never on the boundary)", () => {
    for (const id of ["a", "bb", "ccc", "dddd", "user-12345", "x"]) {
      const { perf, pot } = classificationBoxPosition("A", id, 50, 50);
      expect(perf).toBeGreaterThan(50);
      expect(perf).toBeLessThan(100);
      expect(pot).toBeGreaterThan(50);
      expect(pot).toBeLessThan(100);
    }
  });

  it("is deterministic for the same userId", () => {
    expect(classificationBoxPosition("C", "stable-id")).toEqual(
      classificationBoxPosition("C", "stable-id"),
    );
  });

  // The original bug: classifyTalent and quadrantFromScores disagree for a
  // low-perf/low-potential person the manager rated C. Placement-by-badge fixes
  // it — the dot follows the C classification, so it lands in the C box even
  // though the score-derived quadrant would have been D.
  it("draws the reported bug case (rehire=probably, cv=2, perf≈21) in the C box", () => {
    const classification = classifyTalent({
      rehireDecision: "probably",
      coreValuesScore: 2,
      performanceScore: 21,
    });
    const scoreQuadrant = quadrantFromScores({ performanceScore: 21, potentialScore: 45 });
    expect(classification).toBe("C");
    expect(scoreQuadrant).toBe("D"); // the disagreement that caused the bug

    const { perf, pot } = classificationBoxPosition(classification!, "alok");
    expect(perf).toBeGreaterThanOrEqual(50); // C box (right), not D box (left)
    expect(pot).toBeLessThan(50);
  });
});
