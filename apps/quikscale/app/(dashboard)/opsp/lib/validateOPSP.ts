/**
 * OPSP pre-finalize validation.
 *
 * Two checks:
 *  1. Projection vs breakdown — only enforced for Manual rows. The matrix:
 *       - Automatic + any         → skip (calculateBreakdown owns the row)
 *       - Manual    + Standalone  → skip (StandaloneManualSelect enforces values)
 *       - Manual    + Cumulative  → Σ cells === Projected
 *       - Manual    + CumulativeTillEnd → last cell === Projected
 *  2. Owner missing — for Key Thrusts, Key Initiatives, and Rocks: any row with a
 *     description but no owner is flagged.
 *
 * Empty rows (no projected and no breakdown values) are skipped — they aren't
 * "wrong", just unfilled.
 */
import type { FormData } from "../hooks/useOPSPForm";
import { resolveProjected } from "../components/modals";
import { catMetaCache } from "../components/category";

export interface ValidationError {
  /** "Targets" | "Goals" | "Actions" | "Key Thrusts" | "Key Initiatives" | "Rocks" */
  section: string;
  /** 1-indexed row number for the section's table */
  row: number;
  message: string;
}

const partKeys = {
  targets: ["y1", "y2", "y3", "y4", "y5"] as const,
  goals: ["q1", "q2", "q3", "q4"] as const,
  actions: ["m1", "m2", "m3"] as const,
};

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function checkBreakdown(
  section: string,
  rows: Array<Record<string, string>>,
  parts: readonly string[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  rows.forEach((row, i) => {
    const cat = (row.category ?? "").trim();
    const projectedStr = (row.projected ?? "").trim();
    const projected = resolveProjected(cat, projectedStr);

    const partVals = parts.map((k) => resolveProjected(cat, String(row[k] ?? "")) ?? 0);
    const anyPart = parts.some((k) => String(row[k] ?? "").trim() !== "");
    const allParts = parts.every((k) => String(row[k] ?? "").trim() !== "");

    // Skip fully empty rows.
    if (!projectedStr && !anyPart) return;

    const meta = catMetaCache.get(cat);
    // Default to Automatic + Cumulative when meta is missing — same fallback
    // as the modals. Auto rows are calculator-owned, so no validation fires.
    const breakdownType = meta?.breakdownType ?? "Automatic";
    const categoryType = meta?.categoryType ?? "Cumulative";

    if (breakdownType === "Automatic") return;
    if (categoryType === "Standalone") return; // dropdown enforces cell values

    // ── Manual + Cumulative — sum check ──
    if (categoryType === "Cumulative") {
      if (projected !== null && projected > 0 && !allParts) {
        errors.push({
          section,
          row: i + 1,
          message: `${section} row ${i + 1}${cat ? ` (${cat})` : ""}: missing breakdown values for ${parts.join("/")}.`,
        });
        return;
      }
      if (projected !== null && allParts) {
        const sum = partVals.reduce((a, b) => a + b, 0);
        if (Math.abs(projected - sum) >= 0.01) {
          errors.push({
            section,
            row: i + 1,
            message: `${section} row ${i + 1}${cat ? ` (${cat})` : ""}: ${parts.map((p) => p.toUpperCase()).join("+")} add up to ${fmt.format(sum)}, but Projected is ${fmt.format(projected)} — short by ${fmt.format(projected - sum)}.`,
          });
        }
      }
      return;
    }

    // ── Manual + CumulativeTillEnd — last cell check ──
    if (categoryType === "CumulativeTillEnd") {
      if (projected !== null && projected > 0 && !allParts) {
        errors.push({
          section,
          row: i + 1,
          message: `${section} row ${i + 1}${cat ? ` (${cat})` : ""}: missing breakdown values for ${parts.join("/")}.`,
        });
        return;
      }
      if (projected !== null && allParts) {
        const last = partVals[partVals.length - 1] ?? 0;
        if (Math.abs(projected - last) >= 0.01) {
          const lastKey = parts[parts.length - 1].toUpperCase();
          errors.push({
            section,
            row: i + 1,
            message: `${section} row ${i + 1}${cat ? ` (${cat})` : ""}: the final period (${lastKey} = ${fmt.format(last)}) should match Projected (${fmt.format(projected)}).`,
          });
        }
      }
    }
  });
  return errors;
}

function checkOwners(
  section: string,
  rows: Array<{ desc: string; owner: string }>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  rows.forEach((r, i) => {
    if (r.desc.trim() && !r.owner) {
      errors.push({
        section,
        row: i + 1,
        message: `Row ${i + 1}: description filled but owner missing`,
      });
    }
  });
  return errors;
}

export function validateOPSP(form: FormData): ValidationError[] {
  // Honor the user-selected target horizon (3–5 yrs) — only validate those columns.
  const yrs = Math.max(3, Math.min(5, form.targetYears ?? 5));
  const targetParts = partKeys.targets.slice(0, yrs);
  return [
    ...checkBreakdown("Targets", form.targetRows as unknown as Array<Record<string, string>>, targetParts),
    ...checkBreakdown("Goals", form.goalRows as unknown as Array<Record<string, string>>, partKeys.goals),
    ...checkBreakdown("Actions", form.actionsQtr as unknown as Array<Record<string, string>>, partKeys.actions),
    ...checkOwners("Key Thrusts", form.keyThrusts),
    ...checkOwners("Key Initiatives", form.keyInitiatives),
    ...checkOwners("Rocks", form.rocks),
  ];
}
